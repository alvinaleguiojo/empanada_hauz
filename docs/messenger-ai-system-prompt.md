# Empanada Hauz AI Runtime Architecture

Messenger no longer uses a hardcoded action router or channel-specific AI service. AI requests are processed by the shared `AiRuntimeService`.

## Runtime inputs

The runtime composes its context dynamically from:

- active admin-managed AI instructions and reply instructions;
- the live Product catalog, including availability, names, aliases, prices, and categories;
- the configured Delivery Network pricing;
- the customer and conversation context;
- the persistent pending order draft;
- the currently registered AI application tools.

## Tool execution

The model can select an available tool, but application code remains authoritative. `AiToolRegistryService` exposes the allowed tool contract and `AiApplicationToolsService` enforces customer ownership, validation, confirmation requirements, and application business rules before mutating data.

Current customer-facing capabilities include product lookup, delivery pricing, order summary/status, order draft capture/clear, create/update/cancel/delete order.

## Conversation flow

The runtime may perform several tool-call steps before producing a final response:

```text
customer message
  -> build runtime context
  -> model plans a tool call or final reply
  -> registry validates capability
  -> application executor performs/read authoritative state
  -> result returns to runtime
  -> model continues or responds
```

A pending order is stored separately from the message history as conversation state. Capturing a draft does not create a real order. A real order requires explicit customer confirmation and a successful application-tool execution.

## Source of truth

AI instructions control conversational behavior. Products and delivery settings provide current business data. Application tools provide authoritative database actions and results. The model must not invent prices, availability, order status, ownership, or successful writes.

This document is architectural guidance only; no hardcoded customer-facing system prompt is required in the Messenger service.
