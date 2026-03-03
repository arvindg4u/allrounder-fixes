# OTP Query Patterns

Use these query patterns to reduce false positives before extracting numeric codes.

## Recent OTP-like messages

```text
newer_than:1d subject:(otp OR code OR verification OR "one-time")
```

## Service-specific OTP

```text
from:no-reply@service.com newer_than:1d (subject:(otp OR code) OR "verification code")
```

## Exclude noisy senders

```text
newer_than:1d subject:(otp OR code OR verification) -from:noreply@medium.com -from:news@
```

## Practical Sequence

1. Start with a narrow sender + time filter.
2. Add OTP keywords in subject/body query.
3. Run `otp --query "..."` with the final query.
4. If needed, run `read <message_id> --full` for exact code line confirmation.
