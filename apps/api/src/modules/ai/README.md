# AI date/time handling

Customer order schedules are normalized by the application using `Asia/Manila` server time. Relative values such as `today`, `tomorrow`, and weekday names are converted to ISO 8601 before order updates are sent to the order service.
