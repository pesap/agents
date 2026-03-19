---
name: algorithmic-optimization
description: Analyze and optimize algorithms for time complexity, choosing the best data structures and approaches
license: MIT
allowed-tools: Read Grep Glob Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: developer-tools
---

# Algorithmic Optimization

## When to Use
When reviewing or writing code that processes data — sorting, searching, filtering, aggregating, graph traversal, or any computational logic.

## Instructions

1. **Identify the algorithm** — What is the current approach? Name it (brute force, nested loops, linear scan, etc.)
2. **Analyze complexity** — State exact Big-O for time and space. Account for hidden costs (string concatenation in loops, repeated list lookups, etc.)
3. **Find the bottleneck** — Is it CPU-bound or memory-bound? Which loop or operation dominates?
4. **Propose alternatives** — Suggest a better algorithm or data structure:
   - Nested loops → hash map lookup, sorting + two pointers, sliding window
   - Repeated search → build an index (hash set, sorted array + binary search, trie)
   - Full sort when only top-k needed → heap / quickselect
   - Recomputation → memoization / dynamic programming
   - Sequential when parallelizable → map-reduce, parallel streams
5. **Show the trade-off** — Compare old vs. new: time complexity, space complexity, readability impact
6. **Provide code** — Always include a working code snippet for the optimized version
