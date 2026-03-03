#!/usr/bin/env python3
"""Read-only Gmail CLI using the Gmail API and OAuth Desktop flow."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
from pathlib import Path
from typing import Iterable, Optional

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
except ImportError as exc:
    script_dir = Path(__file__).resolve().parent
    print(
        "Missing dependencies. Run: "
        f"{script_dir}/setup_env.sh",
        file=sys.stderr,
    )
    raise SystemExit(1) from exc

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
SKILL_DIR = Path(__file__).resolve().parents[1]
APP_DIR = Path.home() / ".config" / "gmail-readonly-cli"
DEFAULT_TOKEN_FILE = APP_DIR / "token.json"
DEFAULT_CREDENTIALS_FILE = SKILL_DIR / "assets" / "credentials.json"
ENV_CREDENTIALS_FILE = "GMAIL_CLIENT_SECRET_FILE"
ENV_TOKEN_FILE = "GMAIL_TOKEN_FILE"
ENV_OAUTH_PORT = "GMAIL_OAUTH_PORT"
DEFAULT_OAUTH_PORT = 8080


def decode_base64url(value: str) -> str:
    padding = "=" * (-len(value) % 4)
    decoded = base64.urlsafe_b64decode(value + padding)
    return decoded.decode("utf-8", errors="replace")


def get_header(headers: Iterable[dict], name: str, default: str = "") -> str:
    for header in headers:
        if header.get("name", "").lower() == name.lower():
            return header.get("value", default)
    return default


def iter_parts(payload: dict) -> Iterable[dict]:
    yield payload
    for part in payload.get("parts", []) or []:
        yield from iter_parts(part)


def extract_text_body(payload: dict) -> str:
    text_plain = []
    text_html = []

    for part in iter_parts(payload):
        mime = (part.get("mimeType") or "").lower()
        data = (part.get("body") or {}).get("data")
        if not data:
            continue

        try:
            content = decode_base64url(data)
        except Exception:
            continue

        if "text/plain" in mime and content.strip():
            text_plain.append(content)
        elif "text/html" in mime and content.strip():
            text_html.append(re.sub(r"<[^>]+>", " ", content))

    if text_plain:
        return "\n\n".join(text_plain).strip()
    if text_html:
        return "\n\n".join(text_html).strip()
    return ""


def extract_otp_codes(text: str) -> list[str]:
    keywords = ("otp", "code", "verification", "2fa", "passcode", "one-time")
    preferred = []
    fallback = []

    for match in re.finditer(r"(?<!\d)\d{4,8}(?!\d)", text):
        code = match.group(0)
        context = text[max(0, match.start() - 30) : match.end() + 30].lower()
        target = preferred if any(word in context for word in keywords) else fallback
        if code not in preferred and code not in fallback:
            target.append(code)

    return preferred + fallback


def resolve_credentials_file(cli_path: Optional[str]) -> Path:
    if cli_path:
        return Path(cli_path).expanduser()

    env_path = os.getenv(ENV_CREDENTIALS_FILE)
    if env_path:
        return Path(env_path).expanduser()

    return DEFAULT_CREDENTIALS_FILE


def resolve_token_file(cli_path: Optional[str]) -> Path:
    if cli_path:
        return Path(cli_path).expanduser()

    env_path = os.getenv(ENV_TOKEN_FILE)
    if env_path:
        return Path(env_path).expanduser()

    APP_DIR.mkdir(parents=True, exist_ok=True)
    return DEFAULT_TOKEN_FILE


def load_credentials(token_file: Path) -> Optional[Credentials]:
    if not token_file.exists():
        return None
    try:
        return Credentials.from_authorized_user_file(str(token_file), SCOPES)
    except Exception:
        return None


def authorize(credentials_file: Path, token_file: Path, no_browser: bool = False) -> Credentials:
    creds = load_credentials(token_file)

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        if not credentials_file.exists():
            raise FileNotFoundError(
                f"OAuth client file not found: {credentials_file}. "
                "Download Desktop OAuth credentials from Google Cloud and save as credentials.json."
            )

        try:
            raw_config = json.loads(credentials_file.read_text(encoding="utf-8"))
            web_cfg = raw_config.get("web")
            if isinstance(web_cfg, dict) and not web_cfg.get("redirect_uris"):
                raise ValueError(
                    "The credentials file is a Web client without redirect URIs. "
                    "Create OAuth credentials of type 'Desktop app' and download that JSON."
                )
        except json.JSONDecodeError:
            pass

        flow = InstalledAppFlow.from_client_secrets_file(str(credentials_file), SCOPES)
        oauth_port = int(os.getenv(ENV_OAUTH_PORT, str(DEFAULT_OAUTH_PORT)))
        creds = flow.run_local_server(
            host="127.0.0.1",
            port=oauth_port,
            open_browser=not no_browser,
            access_type="offline",
            prompt="consent",
            include_granted_scopes="true",
        )

    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(creds.to_json(), encoding="utf-8")
    return creds


def build_service(creds: Credentials):
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def cmd_login(args: argparse.Namespace) -> int:
    credentials_file = resolve_credentials_file(args.credentials)
    token_file = resolve_token_file(args.token)
    authorize(credentials_file, token_file, no_browser=args.no_browser)
    print("Login complete. Access token stored at:", token_file)
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    credentials_file = resolve_credentials_file(args.credentials)
    token_file = resolve_token_file(args.token)
    creds = authorize(credentials_file, token_file, no_browser=args.no_browser)
    service = build_service(creds)

    response = (
        service.users()
        .messages()
        .list(userId="me", q=args.query or None, maxResults=args.limit)
        .execute()
    )
    messages = response.get("messages", [])

    if not messages:
        print("No messages found.")
        return 0

    for index, item in enumerate(messages, start=1):
        message = (
            service.users()
            .messages()
            .get(
                userId="me",
                id=item["id"],
                format="metadata",
                metadataHeaders=["From", "Subject", "Date"],
            )
            .execute()
        )
        headers = (message.get("payload") or {}).get("headers", [])
        sender = get_header(headers, "From", "(no from)")
        subject = get_header(headers, "Subject", "(no subject)")
        date = get_header(headers, "Date", "(no date)")
        print(f"{index:>2}. {item['id']}\n    Date: {date}\n    From: {sender}\n    Subject: {subject}\n")

    return 0


def cmd_read(args: argparse.Namespace) -> int:
    credentials_file = resolve_credentials_file(args.credentials)
    token_file = resolve_token_file(args.token)
    creds = authorize(credentials_file, token_file, no_browser=args.no_browser)
    service = build_service(creds)

    message = (
        service.users()
        .messages()
        .get(userId="me", id=args.message_id, format="full")
        .execute()
    )

    payload = message.get("payload") or {}
    headers = payload.get("headers", [])
    sender = get_header(headers, "From", "(no from)")
    subject = get_header(headers, "Subject", "(no subject)")
    date = get_header(headers, "Date", "(no date)")
    snippet = message.get("snippet", "")
    body = extract_text_body(payload)

    print(f"Message ID: {args.message_id}")
    print(f"Date: {date}")
    print(f"From: {sender}")
    print(f"Subject: {subject}")
    if snippet:
        print(f"Snippet: {snippet}")

    print("\nBody:\n")
    if not body:
        print("(No text body found.)")
        return 0

    if args.full:
        print(body)
        return 0

    if len(body) > args.max_chars:
        print(body[: args.max_chars].rstrip())
        print("\n[...output truncated. Use --full to show entire body...]")
    else:
        print(body)

    return 0


def cmd_otp(args: argparse.Namespace) -> int:
    credentials_file = resolve_credentials_file(args.credentials)
    token_file = resolve_token_file(args.token)
    creds = authorize(credentials_file, token_file, no_browser=args.no_browser)
    service = build_service(creds)

    default_query = "newer_than:7d (subject:(otp OR code OR verification) OR \"one-time\" OR \"2fa\")"
    query = args.query or default_query

    response = (
        service.users()
        .messages()
        .list(userId="me", q=query, maxResults=args.limit)
        .execute()
    )

    messages = response.get("messages", [])
    if not messages:
        print("No candidate OTP messages found.")
        return 0

    found_any = False

    for item in messages:
        message = (
            service.users()
            .messages()
            .get(userId="me", id=item["id"], format="full")
            .execute()
        )
        payload = message.get("payload") or {}
        headers = payload.get("headers", [])
        sender = get_header(headers, "From", "(no from)")
        subject = get_header(headers, "Subject", "(no subject)")
        date = get_header(headers, "Date", "(no date)")
        snippet = message.get("snippet", "")
        body = extract_text_body(payload)

        combined_text = "\n".join([subject, snippet, body])
        codes = extract_otp_codes(combined_text)

        if not codes:
            continue

        found_any = True
        print(f"Message ID: {item['id']}")
        print(f"Date: {date}")
        print(f"From: {sender}")
        print(f"Subject: {subject}")
        print(f"OTP Code(s): {', '.join(codes)}")
        print()

        if not args.all:
            return 0

    if not found_any:
        print("Scanned candidate messages but no OTP-style numeric code was detected.")

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Read-only Gmail CLI (OAuth + Gmail API)",
    )
    parser.add_argument(
        "--credentials",
        help=(
            "Path to OAuth client JSON (default: credentials.json or "
            "$GMAIL_CLIENT_SECRET_FILE)"
        ),
    )
    parser.add_argument(
        "--token",
        help=(
            "Path to token JSON cache (default: ~/.config/gmail-readonly-cli/token.json "
            "or $GMAIL_TOKEN_FILE)"
        ),
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Use console auth flow instead of opening a browser.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    login_parser = subparsers.add_parser("login", help="Authenticate and cache token")
    login_parser.set_defaults(handler=cmd_login)

    list_parser = subparsers.add_parser("list", help="List recent messages")
    list_parser.add_argument("--query", default="", help="Gmail search query")
    list_parser.add_argument("--limit", type=int, default=10, help="Number of messages")
    list_parser.set_defaults(handler=cmd_list)

    read_parser = subparsers.add_parser("read", help="Read a message by ID")
    read_parser.add_argument("message_id", help="Gmail message ID")
    read_parser.add_argument(
        "--max-chars",
        type=int,
        default=4000,
        help="Maximum body chars to print (ignored with --full)",
    )
    read_parser.add_argument(
        "--full",
        action="store_true",
        help="Print full message body",
    )
    read_parser.set_defaults(handler=cmd_read)

    otp_parser = subparsers.add_parser("otp", help="Find recent OTP/verification codes")
    otp_parser.add_argument(
        "--query",
        default="",
        help="Optional Gmail query override",
    )
    otp_parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Number of candidate messages to scan",
    )
    otp_parser.add_argument(
        "--all",
        action="store_true",
        help="Show all matching OTP messages instead of just the newest match",
    )
    otp_parser.set_defaults(handler=cmd_otp)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        return args.handler(args)
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except HttpError as exc:
        print(f"Gmail API error: {exc}", file=sys.stderr)
        return 3
    except KeyboardInterrupt:
        print("Cancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
