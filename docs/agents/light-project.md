<!-- light-project:managed:start -->
# Light Project Configuration

- Project type: software
- Goal: Implement a lightweight Cloudflare Worker as a subscription bridge for Just My Socks to append subscription-userinfo headers for FlClash and Mihomo clients
- Outputs: Cloudflare Worker TypeScript implementation, Unit and endpoint test suite, Configuration templates and documentation
- Preset: software
- Relevant Skills: code-review, tdd, implement, project-review
- Issue tracker: local-markdown at .scratch/<effort>/issues
- Domain context: # SPEC: JMS FlClash Subscription Bridge
- Review profile: software
- Acceptance strategy: software profile via project-review
- Working area: .scratch
- Collaboration: default
- Constraints: Stateless Cloudflare Worker on workers.dev without KV/D1/R2/Durable Objects, Preserve official JMS Mihomo YAML body without modification, Never leak service credentials, URLs, or access tokens in code or logs, Support HEAD /clash returning identical subscription-userinfo headers
<!-- light-project:managed:end -->
