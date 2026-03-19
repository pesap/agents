---
name: memory-profiling
description: Analyze code for memory usage, identify leaks and bloat, and suggest memory-efficient alternatives
license: MIT
allowed-tools: Read Grep Glob Bash
metadata:
  author: pesap
  version: "1.0.0"
  category: developer-tools
---

# Memory Profiling

## When to Use
When code handles large datasets, creates many objects, or when memory usage is a concern.

## Instructions

1. **Estimate memory footprint** — Calculate how much memory the current approach uses. Be specific:
   - Python dict: ~240 bytes overhead + 72 bytes per entry
   - Java HashMap: ~48 bytes per entry + key/value objects
   - JavaScript object: ~64-128 bytes overhead per object
   - Strings: length × char size + overhead (24-40 bytes)
2. **Identify memory hotspots**:
   - Collections that grow unboundedly (lists, maps without eviction)
   - Loading entire files/datasets into memory
   - String concatenation in loops (creates intermediate copies)
   - Closures capturing large scopes
   - Circular references preventing GC
3. **Suggest alternatives**:
   - Full list → generator/iterator (process one at a time)
   - Large dict → sorted array + binary search (2-5x less memory)
   - String building → StringBuilder/join pattern
   - Object per row → columnar/struct-of-arrays layout
   - Unbounded cache → LRU with max size
   - Full file read → streaming line-by-line or memory-mapped I/O
   - Multiple copies → references, slices, or views
4. **Quantify the savings** — Show before/after memory estimates with concrete numbers
5. **Suggest profiling tools** — Recommend language-appropriate profiling:
   - Python: `tracemalloc`, `memory_profiler`, `objgraph`
   - JavaScript/Node: `--inspect` + Chrome DevTools heap snapshot, `process.memoryUsage()`
   - Java: VisualVM, JFR, `-XX:NativeMemoryTracking`
   - Go: `pprof`, `runtime.MemStats`
   - Rust: `valgrind`, `DHAT`, `#[global_allocator]` tracking
