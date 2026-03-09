---
layout: home

hero:
  name: Toride
  text: Relation-aware authorization for TypeScript
  tagline: Define your authorization model in YAML. Bring any data source. Let the engine handle role propagation and data filtering.
  actions:
    - theme: brand
      text: Why Toride
      link: /guide/why-toride
    - theme: alt
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/toride-auth/toride

features:
  - title: YAML Policies + Type Safety
    details: Define your entire authorization model declaratively in YAML — roles, relations, conditions, and grants in one file. Codegen validates your resolvers at compile time.
  - title: Database-Agnostic
    details: Resolvers are just functions. Return attributes from any data source — in-memory objects, REST APIs, or databases. No infrastructure requirements.
  - title: Relation-Aware
    details: Model resource hierarchies in YAML and derive roles automatically through relations. No manual role propagation needed.
---
