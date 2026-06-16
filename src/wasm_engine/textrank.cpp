#include "textrank.h"
#include "stemmer.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace textrank {

// Common English stop words
static const std::unordered_set<std::string> &stopWords() {
  static const std::unordered_set<std::string> sw = {
      "a",          "about",      "above",     "after",   "again",   "against",
      "all",        "am",         "an",        "and",     "any",     "are",
      "aren",       "as",         "at",        "be",      "because", "been",
      "before",     "being",      "below",     "between", "both",    "but",
      "by",         "can",        "could",     "couldn",  "d",       "did",
      "didn",       "do",         "does",      "doesn",   "doing",   "don",
      "down",       "during",     "each",      "few",     "for",     "from",
      "further",    "get",        "got",       "had",     "hadn",    "has",
      "hasn",       "have",       "haven",     "having",  "he",      "her",
      "here",       "hers",       "herself",   "him",     "himself", "his",
      "how",        "i",          "if",        "in",      "into",    "is",
      "isn",        "it",         "its",       "itself",  "just",    "ll",
      "m",          "ma",         "me",        "might",   "mightn",  "more",
      "most",       "mustn",      "my",        "myself",  "need",    "needn",
      "no",         "nor",        "not",       "now",     "o",       "of",
      "off",        "on",         "once",      "only",    "or",      "other",
      "our",        "ours",       "ourselves", "out",     "over",    "own",
      "re",         "s",          "same",      "shall",   "shan",    "she",
      "should",     "shouldn",    "so",        "some",    "such",    "t",
      "than",       "that",       "the",       "their",   "theirs",  "them",
      "themselves", "then",       "there",     "these",   "they",    "this",
      "those",      "through",    "to",        "too",     "under",   "until",
      "up",         "ve",         "very",      "was",     "wasn",    "we",
      "were",       "weren",      "what",      "when",    "where",   "which",
      "while",      "who",        "whom",      "why",     "will",    "with",
      "won",        "would",      "wouldn",    "you",     "your",    "yours",
      "yourself",   "yourselves", "also",      "like",    "well",    "much",
      "many",       "even",       "still",     "already", "since",   "however",
      "although",   "though",     "yet",       "may",     "shall",   "us",
      "let",        "say",        "said",      "one",     "two",     "new",
      "know",       "make",       "use",       "way",     "go",      "going",
      "see",        "look",       "thing",     "things",  "think",   "good",
      "back",       "would",      "people",    "really",  "want",    "give",
      "most",       "take",       "come",      "made",    "find",    "right",
      "work",       "first",      "using",     "used",    "want",    "try",
      "tell",       "something",  "called"};
  return sw;
}

// splits the words
struct Token {
  std::string original; // Original surface form (lowercased)
  std::string stemmed;  // Stemmed form
  int position;         // Position in the filtered token sequence
};

static std::vector<Token> tokenize(const std::string &text) {
  std::vector<Token> tokens;
  const auto &sw = stopWords();
  int pos = 0;
  size_t i = 0;

  while (i < text.size()) {
    // Skip non-alpha
    while (i < text.size() &&
           !std::isalpha(static_cast<unsigned char>(text[i])))
      i++;
    if (i >= text.size())
      break;

    // Collect word
    size_t start = i;
    while (i < text.size() && std::isalpha(static_cast<unsigned char>(text[i])))
      i++;
    std::string word = text.substr(start, i - start);

    // Lowercase
    std::string lower = word;
    for (auto &c : lower)
      c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));

    if (lower.size() <= 2 || sw.count(lower))
      continue;

    std::string stem = stemmer::stem(lower);
    if (stem.size() <= 1)
      continue;

    tokens.push_back({lower, stem, pos});
    pos++;
  }
  return tokens;
}

// Undirected weighted graph
struct Graph {
  std::unordered_map<std::string, std::unordered_map<std::string, int>> adj;
  std::unordered_set<std::string> vertices;
};

static Graph buildCooccurrence(const std::vector<Token> &tokens,
                               int windowSize = 3) {
  Graph g;
  int n = static_cast<int>(tokens.size());
  for (int i = 0; i < n; i++) {
    const std::string &a = tokens[i].stemmed;
    g.vertices.insert(a);
    for (int j = i + 1; j < n && j < i + windowSize; j++) {
      const std::string &b = tokens[j].stemmed;
      if (a == b)
        continue;
      g.adj[a][b]++;
      g.adj[b][a]++;
      g.vertices.insert(b);
    }
  }
  return g;
}

// PageRank
// damping factor d=0.85, max 20 iterations.
// Convergence threshold = 1e-4.
static std::unordered_map<std::string, double> pageRank(const Graph &g) {
  const double d = 0.85;
  const int maxIter = 20;
  const double threshold = 1e-4;

  std::unordered_map<std::string, double> scores;
  for (auto &v : g.vertices)
    scores[v] = 1.0;

  std::unordered_map<std::string, double> outDeg;
  for (auto &[node, neighbors] : g.adj) {
    double sum = 0;
    for (auto &[_, w] : neighbors)
      sum += w;
    outDeg[node] = sum;
  }

  for (int iter = 0; iter < maxIter; iter++) {
    std::unordered_map<std::string, double> newScores;
    double maxDelta = 0.0;

    for (auto &v : g.vertices) {
      double rank = 1.0 - d;
      auto it = g.adj.find(v);
      if (it != g.adj.end()) {
        for (auto &[neighbor, weight] : it->second) {
          double od = outDeg.count(neighbor) ? outDeg[neighbor] : 1.0;
          rank += d * (scores[neighbor] * weight / od);
        }
      }
      newScores[v] = rank;
      maxDelta = std::max(maxDelta, std::abs(rank - scores[v]));
    }

    scores = std::move(newScores);
    if (maxDelta < threshold)
      break;
  }
  return scores;
}
// maps to frequently ocuuring word
static std::unordered_map<std::string, std::string>
buildSurfaceMap(const std::vector<Token> &tokens) {
  std::unordered_map<std::string, std::unordered_map<std::string, int>> freq;
  for (auto &t : tokens) {
    freq[t.stemmed][t.original]++;
  }

  std::unordered_map<std::string, std::string> surfaceMap;
  for (auto &[stem, originals] : freq) {
    std::string best;
    int bestCount = 0;
    for (auto &[orig, count] : originals) {
      if (count > bestCount) {
        bestCount = count;
        best = orig;
      }
    }
    // Capitalize first letter for readability
    if (!best.empty()) {
      best[0] =
          static_cast<char>(std::toupper(static_cast<unsigned char>(best[0])));
    }
    surfaceMap[stem] = best;
  }
  return surfaceMap;
}

// if calc word is top scoring with same topic occurence we can merge them
static std::vector<std::string> mergeAdjacentPhrases(
    const std::vector<Token> &tokens,
    const std::unordered_set<std::string> &topStems,
    const std::unordered_map<std::string, std::string> &surfaceMap) {
  std::vector<std::string> phrases;
  int n = static_cast<int>(tokens.size());
  int i = 0;

  while (i < n) {
    if (!topStems.count(tokens[i].stemmed)) {
      i++;
      continue;
    }

    // Start a phrase run
    std::string phrase = surfaceMap.count(tokens[i].stemmed)
                             ? surfaceMap.at(tokens[i].stemmed)
                             : tokens[i].original;
    std::unordered_set<std::string> seen;
    seen.insert(tokens[i].stemmed);
    int j = i + 1;

    if (j < n && tokens[j].position == tokens[j - 1].position + 1 &&
        topStems.count(tokens[j].stemmed) && !seen.count(tokens[j].stemmed)) {
      std::string word = surfaceMap.count(tokens[j].stemmed)
                             ? surfaceMap.at(tokens[j].stemmed)
                             : tokens[j].original;
      phrase += " " + word;
      seen.insert(tokens[j].stemmed);
      j++;
    }

    phrases.push_back(phrase);
    i = j;
  }

  return phrases;
}

// public function
std::vector<std::string> extractKeywords(const std::string &text) {
  if (text.empty())
    return {};

  // 1) Turn text into stemmed tokens (drop stop-words).
  auto tokens = tokenize(text);
  if (tokens.empty())
    return {};

  // 2) Build a small co-occurrence graph (sliding window).
  auto graph = buildCooccurrence(tokens);
  if (graph.vertices.empty())
    return {};

  // 3) Score tokens with PageRank over that graph.
  auto scores = pageRank(graph);

  // 4) Pick the top-ranked stems.
  std::vector<std::pair<std::string, double>> ranked(scores.begin(),
                                                     scores.end());
  std::sort(ranked.begin(), ranked.end(),
            [](const auto &a, const auto &b) { return a.second > b.second; });

  int topN = std::min(5, static_cast<int>(ranked.size()));
  std::unordered_set<std::string> topStems;
  for (int i = 0; i < topN; i++)
    topStems.insert(ranked[i].first);

  // 5) Convert stems back to a readable surface form.
  auto surfaceMap = buildSurfaceMap(tokens);

  // 6) Merge neighboring top tokens into short phrases.
  auto phrases = mergeAdjacentPhrases(tokens, topStems, surfaceMap);

  // Remove duplicates while preserving order.
  std::vector<std::string> unique;
  std::unordered_set<std::string> seen;
  for (auto &p : phrases) {
    if (seen.insert(p).second)
      unique.push_back(p);
  }

  // Keep output small.
  if (unique.size() > 5)
    unique.resize(5);

  // If phrase merging didn’t yield anything useful, fall back to top stems.
  if (unique.empty()) {
    for (int i = 0; i < topN; i++) {
      std::string stem = ranked[i].first;
      std::string surface = surfaceMap.count(stem) ? surfaceMap[stem] : stem;
      unique.push_back(surface);
    }
  }

  return unique;
}
} // namespace textrank