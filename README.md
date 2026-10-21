# Robots That Take Initiative: literature map

An interactive map of the literature on proactive robot assistance, organized by the framework in Patel and Chernova, [*Robots That Take Initiative: A Framework for Building and Evaluating Proactive Robots*](https://arxiv.org/abs/2609.28910).

**Live site:** https://maithili.github.io/RobotsThatTakeInitiative/

The site has three views of one database:

- **Methods.** Proactive methods by level (L0, L1, L2) and family, on a lineage graph or a sortable list.
- **Evaluations.** Which terms of the net value ΔV − ΔC each metric measures, how close each evaluation loop comes to real use, and the datasets behind them.
- **Subproblems.** Works under each subproblem from goal-space representation (G1) to coordinated action selection (P2), with what part each one solves.

Every view is a URL, so filters, an open paper, and a comparison can be shared.

## Contribute

Suggest a paper or a correction through an issue, or edit the YAML in [`data/`](data) and open a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Develop

```bash
npm install
npm run dev
```

`npm run validate` checks the data, `npm test` runs unit tests, and `npm run e2e` runs the Playwright tests. Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`; enable it once under Settings → Pages → Source → "GitHub Actions".

## License

MIT. See [LICENSE](LICENSE).
