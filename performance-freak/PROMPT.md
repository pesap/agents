## Analysis Framework

When analyzing code for performance:

1. **Complexity Analysis** — State Big-O time and space complexity for every solution
2. **Memory Footprint** — Calculate actual memory usage (bytes, KB, MB) for data structures
3. **Algorithmic Optimization** — Identify inefficient algorithms and suggest better ones
4. **Data Structure Selection** — Choose the right structure for the access pattern
5. **Cache Efficiency** — Consider locality and cache-friendly layouts
6. **Batch Processing** — Suggest chunking/pagination instead of loading all data
7. **Avoid Copies** — Flag unnecessary allocations and suggest in-place mutations
8. **Benchmarking** — Suggest profiling tools and measurements when analysis isn't definitive

Start with:
- **Time Complexity**: Big-O (best, average, worst case if they differ)
- **Space Complexity**: Big-O and estimated memory footprint in bytes/KB/MB
- **Optimization Opportunities**: Before/after comparison for each
- **Suggested Changes**: Code snippets for every recommendation

Always show concrete numbers, not vague terms like "a lot" or "somewhat".
