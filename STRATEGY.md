# PhoenixSig Strategy

This file is the strategy source of truth for PhoenixSig.

## Summary

PhoenixSig is a shares-only TQQQ model with:
- quarterly rebalances
- a 15% next-quarter TQQQ target
- an ATH drawdown sell-skip guard
- a floor reset rule
- defensive sleeve parking in cash before SGOV data exists, then SGOV

## Data And Execution Assumptions

- Rebalance calculations use the dataset's same-day market open prices on the rebalance date
- Signals are built from Yahoo Finance market data
- Actual broker fills can differ from the model's open-price assumption
- The ATH calculation uses closing prices, not intraday highs

## Rule Order Of Precedence

These rules are listed in the order they should be understood and applied.

### 1. Initial Allocation

- This is only for initialization and is not continuously maintained
- Start at `90% TQQQ / 10% Defensive`
- The defensive sleeve is:
  - cash until SGOV data exists
  - SGOV once SGOV data exists

### 2. Rebalance Calendar

- Rebalance only on the first US business day of:
  - January
  - April
  - July
  - October

### 3. Rolling ATH Drawdown Guard

- Track the highest TQQQ closing price over the last `315` trading days
- This is a rolling lookback, roughly equal to `5` quarters
- If the current TQQQ closing price is below `70%` of that rolling ATH close:
  - skip TQQQ sells for `126` trading days
- `126` trading days is roughly `2` quarters
- If the same ATH drawdown condition continues to hold, the `126`-day skip-sell window refreshes forward again

What this means:
- The model can still buy TQQQ during this period
- The model suppresses sells of TQQQ while the skip-sell guard is active

### 4. Quarterly Rebalance Target

- On each rebalance date, compare the live TQQQ sleeve against the current quarter's target
- The target is based on the last quarter's post-rebalance TQQQ sleeve value
- PhoenixSig uses:
  - `15% target = last quarter TQQQ balance x 1.15`

### 5. If TQQQ Sleeve Is Above Target

- Sell excess TQQQ down to the current quarter target
- Move that excess into the defensive sleeve
- Exception:
  - if the ATH drawdown skip-sell guard is active, that sell is blocked and no TQQQ sell is executed

### 6. If TQQQ Sleeve Is Below Target

- Draw from the defensive sleeve to buy TQQQ up to the current quarter target
- If the defensive sleeve does not have enough to fully cover the buy:
  - buy as much TQQQ as possible
  - ending at `100% TQQQ / 0% Defensive` is allowed

### 7. Floor Rule

- The floor rule is checked only at quarterly rebalance
- If TQQQ falls below `60%` of the total portfolio:
  - reset the target allocation to `60% TQQQ / 40% Defensive`
- Important:
  - the floor rule does not override the ATH drawdown sell-skip guard
  - if the floor reset would require a TQQQ sell while the skip-sell guard is active, that sell is still blocked

### 8. Final Step

- The next quarter's TQQQ target is calculated last
- This happens after all rebalance adjustments are completed
- In other words:
  - do the actual rebalance actions first
  - then set the next quarter's target baseline from the final post-rebalance TQQQ sleeve value

## Short Ruleboard Version

### 1. Initial Allocation

| Rule | Detail |
| --- | --- |
| Start | 90% TQQQ / 10% Defensive |
| Defensive Sleeve | Cash until SGOV data exists, then SGOV |

### 2. Quarterly Rebalance

| Rule | Detail |
| --- | --- |
| Execution Basis | Rebalance calculations use the same-day market open prices from the dataset on the rebalance date |
| Target | 15% target = Last quarter TQQQ balance x 1.15 ( updated quarterly ) |
| If Above | Sell excess down to 15% target -> Move excess to Defensive sleeve |
| If Below | Draw funds from Defensive sleeve to 15% target |
| Buy Cap | If Defensive sleeve does not have enough, buy as much as possible -> Can end at 100% TQQQ |
| ATH DD | If TQQQ closing price < 70% of the highest closing price over the last 315 trading days (~5 quarters) -> Skip TQQQ SELLS for 126 trading days (~2 quarters) |
| ATH DD Refresh | The 126-day skip window refreshes daily if condition persists |
| FLOOR | If TQQQ < 60% portfolio, reset to 60/40 TQQQ / Defensive allocation ( enforced only at quarterly rebalance ) |
| Final Step | The 15% next-quarter target is calculated last, after all rebalance adjustments are made |
