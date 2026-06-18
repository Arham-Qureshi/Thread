#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#include "stemmer.h"
#include "textrank.h"
#include <cstdlib>
#include <cstring>
#include <string>
#include <unordered_map>
#include <vector>

static std::string jsonEscape(const std::string &s) {
  std::string out;
  out.reserve(s.size() + 16);
  for (char c : s) {
    switch (c) {
    case '"':
      out += "\\\"";
      break;
    case '\\':
      out += "\\\\";
      break;
    case '\n':
      out += "\\n";
      break;
    case '\r':
      out += "\\r";
      break;
    case '\t':
      out += "\\t";
      break;
    default:
      out += c;
    }
  }
  return out;
}

static std::string parseJsonString(const std::string &json, size_t &pos) {
  std::string result;
  while (pos < json.size()) {
    char c = json[pos++];
    if (c == '"')
      return result;
    if (c == '\\' && pos < json.size()) {
      char next = json[pos++];
      switch (next) {
      case '"':
        result += '"';
        break;
      case '\\':
        result += '\\';
        break;
      case 'n':
        result += '\n';
        break;
      case 'r':
        result += '\r';
        break;
      case 't':
        result += '\t';
        break;
      case '/':
        result += '/';
        break;
      default:
        result += next;
        break;
      }
    } else {
      result += c;
    }
  }
  return result;
}

struct Message {
  std::string role, content;
};
struct Node {
  std::string id, type, subtype, role, language, content;
};
struct Edge {
  std::string source, target, relation;
};

static std::vector<Message> parseMessages(const std::string &json) {
  std::vector<Message> msgs;
  size_t pos = 0;
  while (pos < json.size() && json[pos] != '[')
    pos++;
  if (pos >= json.size())
    return msgs;
  pos++;

  while (pos < json.size()) {
    while (pos < json.size() && json[pos] != '{' && json[pos] != ']')
      pos++;
    if (pos >= json.size() || json[pos] == ']')
      break;
    pos++;

    Message msg;
    while (pos < json.size() && json[pos] != '}') {
      while (pos < json.size() && json[pos] != '"') {
        if (json[pos] == '}')
          goto done;
        pos++;
      }
      pos++;
      std::string key = parseJsonString(json, pos);
      while (pos < json.size() && json[pos] != ':')
        pos++;
      pos++;
      while (pos < json.size() && json[pos] != '"')
        pos++;
      pos++;
      std::string val = parseJsonString(json, pos);
      if (key == "role")
        msg.role = val;
      else if (key == "content")
        msg.content = val;
      while (pos < json.size() && json[pos] != ',' && json[pos] != '}')
        pos++;
      if (json[pos] == ',')
        pos++;
    }
  done:
    if (pos < json.size())
      pos++;
    if (!msg.role.empty())
      msgs.push_back(msg);
  }
  return msgs;
}

struct CodeBlock {
  std::string language, code;
};

static std::vector<CodeBlock> extractCodeBlocks(const std::string &content) {
  std::vector<CodeBlock> blocks;
  size_t pos = 0;
  while (pos < content.size()) {
    size_t start = content.find("```", pos);
    if (start == std::string::npos)
      break;
    size_t langEnd = content.find('\n', start + 3);
    if (langEnd == std::string::npos)
      break;
    std::string lang = content.substr(start + 3, langEnd - (start + 3));
    while (!lang.empty() && (lang.back() == ' ' || lang.back() == '\r'))
      lang.pop_back();
    size_t codeEnd = content.find("```", langEnd + 1);
    if (codeEnd == std::string::npos)
      break;
    std::string code = content.substr(langEnd + 1, codeEnd - langEnd - 1);
    while (!code.empty() && (code.back() == '\n' || code.back() == '\r'))
      code.pop_back();
    blocks.push_back({lang, code});
    pos = codeEnd + 3;
  }
  return blocks;
}

static std::vector<std::string> extractLinks(const std::string &content) {
  std::vector<std::string> links;
  size_t pos = 0;
  while (pos < content.size()) {
    size_t br = content.find("](", pos);
    if (br == std::string::npos)
      break;
    size_t urlEnd = content.find(')', br + 2);
    if (urlEnd == std::string::npos)
      break;
    std::string url = content.substr(br + 2, urlEnd - br - 2);
    if (url.size() > 4)
      links.push_back(url);
    pos = urlEnd + 1;
  }
  pos = 0;
  while (pos < content.size()) {
    size_t h = content.find("http", pos);
    if (h == std::string::npos)
      break;
    if (content.substr(h, 8) != "https://" &&
        content.substr(h, 7) != "http://") {
      pos = h + 4;
      continue;
    }
    size_t end = h;
    while (end < content.size() && content[end] != ' ' &&
           content[end] != '\n' && content[end] != ')' && content[end] != '"')
      end++;
    std::string url = content.substr(h, end - h);
    bool dup = false;
    for (auto &l : links)
      if (l == url) {
        dup = true;
        break;
      }
    if (!dup)
      links.push_back(url);
    pos = end;
  }
  return links;
}

static std::vector<std::string> extractBoldVars(const std::string &content) {
  std::vector<std::string> vars;
  size_t pos = 0;
  while (pos < content.size()) {
    size_t s = content.find("**", pos);
    if (s == std::string::npos)
      break;
    size_t e = content.find("**", s + 2);
    if (e == std::string::npos)
      break;
    std::string text = content.substr(s + 2, e - s - 2);
    if (!text.empty() && text.size() < 80)
      vars.push_back(text);
    pos = e + 2;
  }
  return vars;
}

static std::string serializeGraph(const std::vector<Node> &nodes,
                                  const std::vector<Edge> &edges) {
  std::string j = "{\"nodes\":[";
  for (size_t i = 0; i < nodes.size(); i++) {
    if (i)
      j += ",";
    j += "{\"id\":\"" + jsonEscape(nodes[i].id) + "\"";
    j += ",\"type\":\"" + jsonEscape(nodes[i].type) + "\"";
    if (!nodes[i].subtype.empty())
      j += ",\"subtype\":\"" + jsonEscape(nodes[i].subtype) + "\"";
    if (!nodes[i].role.empty())
      j += ",\"role\":\"" + jsonEscape(nodes[i].role) + "\"";
    if (!nodes[i].language.empty())
      j += ",\"language\":\"" + jsonEscape(nodes[i].language) + "\"";
    j += ",\"content\":\"" + jsonEscape(nodes[i].content) + "\"}";
  }
  j += "],\"edges\":[";
  for (size_t i = 0; i < edges.size(); i++) {
    if (i)
      j += ",";
    j += "{\"source\":\"" + jsonEscape(edges[i].source) + "\"";
    j += ",\"target\":\"" + jsonEscape(edges[i].target) + "\"";
    j += ",\"relation\":\"" + jsonEscape(edges[i].relation) + "\"}";
  }
  j += "]}";
  return j;
}

static char *resultBuffer = nullptr;

static const char *returnString(const std::string &s) {
  free(resultBuffer);
  resultBuffer = (char *)malloc(s.size() + 1);
  memcpy(resultBuffer, s.c_str(), s.size() + 1);
  return resultBuffer;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE
const char *processString(const char *input) {
  return returnString(std::string(input) + " - PROCESSED");
}

EMSCRIPTEN_KEEPALIVE
const char *buildGraph(const char *jsonInput) {
  auto messages = parseMessages(std::string(jsonInput));

  std::vector<Node> nodes;
  std::vector<Edge> edges;
  int tIdx = 0, aIdx = 0;
  std::string prevId;

  // Enables cross-message inter-connectivity
  std::unordered_map<std::string, std::string> globalRegistry;

  for (auto &msg : messages) {
    std::string tid = "t" + std::to_string(tIdx++);

    std::string summary = msg.content;
    while (true) {
      size_t s = summary.find("```");
      if (s == std::string::npos)
        break;
      size_t e = summary.find("```", s + 3);
      if (e == std::string::npos)
        break;
      summary.erase(s, e - s + 3);
    }
    if (summary.size() > 120)
      summary = summary.substr(0, 120) + "...";

    nodes.push_back({tid, "task", "", msg.role, "", summary});

    if (!prevId.empty())
      edges.push_back({prevId, tid, "sequence"});
    prevId = tid;

    for (auto &cb : extractCodeBlocks(msg.content)) {
      std::string aid = "a" + std::to_string(aIdx++);
      nodes.push_back({aid, "artifact", "code", "", cb.language, cb.code});
      edges.push_back({tid, aid, "contains"});
    }

    for (auto &link : extractLinks(msg.content)) {
      std::string aid = "a" + std::to_string(aIdx++);
      nodes.push_back({aid, "artifact", "link", "", "", link});
      edges.push_back({tid, aid, "references"});
    }

    // TextRank semantic keyword extraction + Global Entity Registry
    for (auto &keyword : textrank::extractKeywords(msg.content)) {

      std::string registryKey;
      {
        std::string lower = keyword;
        for (auto &c : lower)
          c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));

        size_t sp = lower.find(' ');
        std::string firstWord =
            (sp != std::string::npos) ? lower.substr(0, sp) : lower;
        registryKey = stemmer::stem(firstWord);
        if (sp != std::string::npos) {
          std::string secondWord = lower.substr(sp + 1);
          size_t sp2 = secondWord.find(' ');
          if (sp2 != std::string::npos)
            secondWord = secondWord.substr(0, sp2);
          registryKey += "_" + stemmer::stem(secondWord);
        }
      }

      auto it = globalRegistry.find(registryKey);
      if (it == globalRegistry.end()) {
        // if node is new and not interconnected make a new node
        std::string aid = "a" + std::to_string(aIdx++);
        nodes.push_back({aid, "artifact", "variable", "", "", keyword});
        edges.push_back({tid, aid, "mentions"});
        globalRegistry[registryKey] = aid;
      } else {
        edges.push_back({tid, it->second, "mentions"});
      }
    }
  }

  // freeing the dynamic heap
  std::string result = serializeGraph(nodes, edges);
  globalRegistry.clear();
  nodes.clear();
  edges.clear();

  return returnString(result);
}
}