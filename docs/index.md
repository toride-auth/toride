---
layout: home

hero:
  name: Toride
  text: Relation-aware authorization for TypeScript
  tagline: Define policies in YAML, resolve relations from your database, and let the engine handle the rest — including partial evaluation for data filtering.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/toride-auth/toride

features:
  - title: YAML Policies
    details: Define your authorization rules declaratively in YAML — roles, relations, conditions, and grants in one readable file.
  - title: Relation-Aware
    details: Derive roles through resource relations automatically. No manual role propagation needed.
  - title: Partial Evaluation
    details: Generate database-level WHERE clauses from your policies for efficient data filtering with Prisma or Drizzle.
---
