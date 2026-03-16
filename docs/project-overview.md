# SnapQuote - Project Overview

SnapQuote is an AI-assisted quoting and lead management SaaS for outdoor service contractors.

## Core Estimation Flow

Customer request form
-> lead created
-> property data lookup
-> AI interpretation layer
-> deterministic estimator
-> estimate stored
-> review in analytics tools (Metabase)

## Important Architecture Rule

Pricing is deterministic.
AI does NOT generate final prices.

AI only interprets job signals such as:

* scope
* surfaces
* quantity
* subtype
* materials
* access difficulty
* condition

The deterministic estimator calculates the final quote.
