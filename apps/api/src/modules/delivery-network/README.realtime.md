# Rider realtime contract

The delivery network is realtime-first. Clients should subscribe to the Socket.IO events below after authentication and use the REST API only for initial hydration/recovery.

## Events

- `delivery-network.jobs.updated`: emitted globally whenever a delivery job is created, assigned, or its status changes.
- `rider.delivery.assigned`: emitted directly to the assigned rider when a job is assigned.
- `rider.delivery.updated`: emitted directly to the assigned rider when the job status changes.
- `delivery-network.rider-location.updated`: emitted globally when a rider location is accepted.
- `rider.location.updated`: emitted directly to that rider after their location is accepted.
- `delivery-network.riders.updated`: emitted globally when rider availability/status changes.
- `rider.status.updated`: emitted directly to a rider when their availability/status changes.

## Client rule

The rider app must not require a manual refresh after assignment. On `rider.delivery.assigned`, replace/insert the active delivery job and render the pickup route. On `rider.delivery.updated`, update the active job and switch navigation destination when the status becomes `picked_up`/`delivering`. On reconnect, call the active-job endpoint to hydrate state and then resume socket listeners.
