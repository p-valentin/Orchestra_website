-- Phase 2 provider switch: Lemon Squeezy → Paddle (merchant of record that
-- onboards unregistered individuals in Romania). The license system is
-- provider-agnostic by design; the only schema traces are the order-id
-- column name and the webhook_events provider default.

alter table public.licenses rename column ls_order_id to order_id;

alter table public.webhook_events alter column provider set default 'paddle';
