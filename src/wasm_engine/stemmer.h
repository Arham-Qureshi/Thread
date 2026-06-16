#ifndef THREAD_STEMMER_H
#define THREAD_STEMMER_H

// using stemmers algo for stripping recurring keywords
#include <string>

namespace stemmer {

namespace detail {

inline bool cons(const std::string &b, int i) {
  switch (b[i]) {
  case 'a':
  case 'e':
  case 'i':
  case 'o':
  case 'u':
    return false;
  case 'y':
    return (i == 0) ? true : !cons(b, i - 1);
  default:
    return true;
  }
}

inline int measure(const std::string &b, int j) {
  int n = 0, i = 0;
  while (true) {
    if (i > j)
      return n;
    if (!cons(b, i))
      break;
    i++;
  }
  i++;
  while (true) {
    while (true) {
      if (i > j)
        return n;
      if (cons(b, i))
        break;
      i++;
    }
    i++;
    n++;
    while (true) {
      if (i > j)
        return n;
      if (!cons(b, i))
        break;
      i++;
    }
    i++;
  }
}

// Returns true if b[0..j] contains a vowel.
inline bool vowelInStem(const std::string &b, int j) {
  for (int i = 0; i <= j; i++) {
    if (!cons(b, i))
      return true;
  }
  return false;
}

// Returns true if b[j] and b[j-1] are the same consonant.
inline bool doubleCons(const std::string &b, int j) {
  if (j < 1)
    return false;
  if (b[j] != b[j - 1])
    return false;
  return cons(b, j);
}

inline bool cvc(const std::string &b, int i) {
  if (i < 2 || !cons(b, i) || cons(b, i - 1) || !cons(b, i - 2))
    return false;
  char ch = b[i];
  return (ch != 'w' && ch != 'x' && ch != 'y');
}

inline bool ends(const std::string &b, int k, const char *s, int slen, int &j) {
  if (slen > k + 1)
    return false;
  if (b[k - slen + 1] != s[0])
    return false; // Quick reject (not same as reference but equivalent)
  for (int i = 0; i < slen; i++) {
    if (b[k - slen + 1 + i] != s[i])
      return false;
  }
  j = k - slen;
  return true;
}

inline int setto(std::string &b, int j, const char *s, int slen) {
  for (int i = 0; i < slen; i++) {
    b[j + 1 + i] = s[i];
  }
  return j + slen;
}

// Replace suffix only if measure > 0.
inline int r(std::string &b, int k, int j, const char *s, int slen) {
  if (measure(b, j) > 0)
    return setto(b, j, s, slen);
  return k;
}

// step 1
inline int step1ab(std::string &b, int k) {
  int j;
  if (b[k] == 's') {
    if (ends(b, k, "sses", 4, j))
      k -= 2;
    else if (ends(b, k, "ies", 3, j))
      k--;
    else if (b[k - 1] != 's')
      k--;
  }
  if (ends(b, k, "eed", 3, j)) {
    if (measure(b, j) > 0)
      k--;
  } else if ((ends(b, k, "ed", 2, j) || ends(b, k, "ing", 3, j)) &&
             vowelInStem(b, j)) {
    k = j;
    if (ends(b, k, "at", 2, j))
      k = setto(b, j, "ate", 3);
    else if (ends(b, k, "bl", 2, j))
      k = setto(b, j, "ble", 3);
    else if (ends(b, k, "iz", 2, j))
      k = setto(b, j, "ize", 3);
    else if (doubleCons(b, k)) {
      k--;
      char ch = b[k];
      if (ch == 'l' || ch == 's' || ch == 'z')
        k++;
    } else if (measure(b, k) == 1 && cvc(b, k)) {
      k = setto(b, k, "e", 1);
    }
  }
  return k;
}

inline int step1c(std::string &b, int k) {
  int j;
  (void)j; // unused directly, vowelInStem uses k-1
  if (b[k] == 'y' && vowelInStem(b, k - 1))
    b[k] = 'i';
  return k;
}

// step 2
inline int step2(std::string &b, int k) {
  int j;
  switch (b[k - 1]) {
  case 'a':
    if (ends(b, k, "ational", 7, j)) {
      k = r(b, k, j, "ate", 3);
      break;
    }
    if (ends(b, k, "tional", 6, j)) {
      k = r(b, k, j, "tion", 4);
      break;
    }
    break;
  case 'c':
    if (ends(b, k, "enci", 4, j)) {
      k = r(b, k, j, "ence", 4);
      break;
    }
    if (ends(b, k, "anci", 4, j)) {
      k = r(b, k, j, "ance", 4);
      break;
    }
    break;
  case 'e':
    if (ends(b, k, "izer", 4, j)) {
      k = r(b, k, j, "ize", 3);
      break;
    }
    break;
  case 'l':
    if (ends(b, k, "abli", 4, j)) {
      k = r(b, k, j, "able", 4);
      break;
    }
    if (ends(b, k, "alli", 4, j)) {
      k = r(b, k, j, "al", 2);
      break;
    }
    if (ends(b, k, "entli", 5, j)) {
      k = r(b, k, j, "ent", 3);
      break;
    }
    if (ends(b, k, "eli", 3, j)) {
      k = r(b, k, j, "e", 1);
      break;
    }
    if (ends(b, k, "ousli", 5, j)) {
      k = r(b, k, j, "ous", 3);
      break;
    }
    break;
  case 'o':
    if (ends(b, k, "ization", 7, j)) {
      k = r(b, k, j, "ize", 3);
      break;
    }
    if (ends(b, k, "ation", 5, j)) {
      k = r(b, k, j, "ate", 3);
      break;
    }
    if (ends(b, k, "ator", 4, j)) {
      k = r(b, k, j, "ate", 3);
      break;
    }
    break;
  case 's':
    if (ends(b, k, "alism", 5, j)) {
      k = r(b, k, j, "al", 2);
      break;
    }
    if (ends(b, k, "iveness", 7, j)) {
      k = r(b, k, j, "ive", 3);
      break;
    }
    if (ends(b, k, "fulness", 7, j)) {
      k = r(b, k, j, "ful", 3);
      break;
    }
    if (ends(b, k, "ousness", 7, j)) {
      k = r(b, k, j, "ous", 3);
      break;
    }
    break;
  case 't':
    if (ends(b, k, "aliti", 5, j)) {
      k = r(b, k, j, "al", 2);
      break;
    }
    if (ends(b, k, "iviti", 5, j)) {
      k = r(b, k, j, "ive", 3);
      break;
    }
    if (ends(b, k, "biliti", 6, j)) {
      k = r(b, k, j, "ble", 3);
      break;
    }
    break;
  }
  return k;
}

// step 3
inline int step3(std::string &b, int k) {
  int j;
  switch (b[k]) {
  case 'e':
    if (ends(b, k, "icate", 5, j)) {
      k = r(b, k, j, "ic", 2);
      break;
    }
    if (ends(b, k, "ative", 5, j)) {
      k = r(b, k, j, "", 0);
      break;
    }
    if (ends(b, k, "alize", 5, j)) {
      k = r(b, k, j, "al", 2);
      break;
    }
    break;
  case 'i':
    if (ends(b, k, "iciti", 5, j)) {
      k = r(b, k, j, "ic", 2);
      break;
    }
    break;
  case 'l':
    if (ends(b, k, "ical", 4, j)) {
      k = r(b, k, j, "ic", 2);
      break;
    }
    if (ends(b, k, "ful", 3, j)) {
      k = r(b, k, j, "", 0);
      break;
    }
    break;
  case 's':
    if (ends(b, k, "ness", 4, j)) {
      k = r(b, k, j, "", 0);
      break;
    }
    break;
  }
  return k;
}

// step 4
inline int step4(std::string &b, int k) {
  int j;
  switch (b[k - 1]) {
  case 'a':
    if (ends(b, k, "al", 2, j))
      break;
    return k;
  case 'c':
    if (ends(b, k, "ance", 4, j))
      break;
    if (ends(b, k, "ence", 4, j))
      break;
    return k;
  case 'e':
    if (ends(b, k, "er", 2, j))
      break;
    return k;
  case 'i':
    if (ends(b, k, "ic", 2, j))
      break;
    return k;
  case 'l':
    if (ends(b, k, "able", 4, j))
      break;
    if (ends(b, k, "ible", 4, j))
      break;
    return k;
  case 'n':
    if (ends(b, k, "ant", 3, j))
      break;
    if (ends(b, k, "ement", 5, j))
      break;
    if (ends(b, k, "ment", 4, j))
      break;
    if (ends(b, k, "ent", 3, j))
      break;
    return k;
  case 'o':
    if (ends(b, k, "ion", 3, j) && j >= 0 && (b[j] == 's' || b[j] == 't'))
      break;
    if (ends(b, k, "ou", 2, j))
      break;
    return k;
  case 's':
    if (ends(b, k, "ism", 3, j))
      break;
    return k;
  case 't':
    if (ends(b, k, "ate", 3, j))
      break;
    if (ends(b, k, "iti", 3, j))
      break;
    return k;
  case 'u':
    if (ends(b, k, "ous", 3, j))
      break;
    return k;
  case 'v':
    if (ends(b, k, "ive", 3, j))
      break;
    return k;
  case 'z':
    if (ends(b, k, "ize", 3, j))
      break;
    return k;
  default:
    return k;
  }
  if (measure(b, j) > 1)
    k = j;
  return k;
}

// step 5->clean up
inline int step5(std::string &b, int k) {
  int j = k;
  if (b[k] == 'e') {
    int m = measure(b, k - 1);
    if (m > 1 || (m == 1 && !cvc(b, k - 1)))
      k--;
  }
  if (b[k] == 'l' && doubleCons(b, k) && measure(b, k - 1) > 1)
    k--;
  (void)j;
  return k;
}

} // namespace detail

// Stem a single word. Returns the stemmed version.
inline std::string stem(const std::string &word) {
  if (word.size() <= 2)
    return word;

  std::string b = word;
  for (auto &c : b)
    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  b.resize(b.size() + 8, '\0');

  int k = static_cast<int>(word.size()) - 1;

  k = detail::step1ab(b, k);
  k = detail::step1c(b, k);
  k = detail::step2(b, k);
  k = detail::step3(b, k);
  k = detail::step4(b, k);
  k = detail::step5(b, k);

  return b.substr(0, k + 1);
}

} // namespace stemmer

#endif