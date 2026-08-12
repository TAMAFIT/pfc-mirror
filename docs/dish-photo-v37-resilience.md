# Dish photo v3.7 resilience

## Reproduced production failure
Using the same bento image through the existing public Apps Script web app, three consecutive requests produced 404/404/200 with approximately 27.9s, 20.3s and 2.9s latency. The 404 bodies were Google HTML responses rather than Gemini API JSON, so the instability is in the web-app delivery path rather than the food prompt alone.

## Redundant Apps Script deployment
A second immutable deployment was created in the same Apps Script project using the same code and Script Properties:

- primary: deployment @3
- secondary: deployment @4

Alternating benchmark requests showed uncorrelated latency: one trial had the primary at ~29.2s while the secondary returned successfully in ~3.1s. v3.7 therefore uses delayed hedging instead of sequential retry.

## v3.7 behavior
- primary request starts immediately
- secondary starts after 4.5s only if primary has not already succeeded
- first valid parsed response wins
- each route has a 22s client timeout
- Gemini structured output uses an explicit JSON schema
- parser also accepts legacy top-level arrays of dish groups and flattens their foods
- Food Master specificity and no-auto-quantity safeguards remain in force
- result UI includes a direct action to analyze another photo
