# Robots That Take Initiative: literature map

An interactive map of the literature on proactive robot assistance, organized by the framework in Patel and Chernova, [*Robots That Take Initiative: A Framework for Building and Evaluating Proactive Robots*](https://arxiv.org/abs/2609.28910).

**Live site:** https://maithili.github.io/RobotsThatTakeInitiative/

The site has three views of one database:

- **Methods.** Collaborative (L1) and unprompted (L2) methods on a condensed timeline, and an interconnected literature graph of L2 work clustered by family, with builds-on, benchmarks-against, and cites edges. A sortable list covers every level.
- **Evaluations.** Which terms of the net value ΔV − ΔC each metric measures, how close each evaluation comes to the real target (robot, people, setting), and the datasets and evaluation setups behind them.
- **Subproblems.** Works that address each subproblem, from goal-space representation to coordinated action selection, with what part each one solves.

Every view is a URL, so filters, an open paper, and a comparison can be shared.

## Contribute

Suggest a paper or a correction through an issue, or edit the YAML in [`data/`](data) and open a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Develop

```bash
npm install
npm run dev
```

`npm run validate` checks the data, `npm test` runs unit tests, and `npm run e2e` runs the Playwright tests. Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`; enable it once under Settings → Pages → Source → "GitHub Actions".

## Maintenance notes

- Run `npm run fetch-citations` after adding papers to refresh `data/citations.json` (the dotted "cites" edges). Set `S2_API_KEY` to avoid Semantic Scholar's shared rate limit.
- Set realism.source_url once the source paper is public.

## License

MIT. See [LICENSE](LICENSE).
