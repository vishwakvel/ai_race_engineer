"""
AI race engineer: convert structured ML outputs into radio-style messages via Claude.
LLM only generates narration from facts; it does not make strategic decisions.
"""

import os
import re
import json
from typing import Literal

MessageType = Literal[
    "RACE_START_SUMMARY",
    "ROUTINE_PACE_NOTE",
    "TYRE_ADVISORY",
    "CLIFF_WARNING",
    "PIT_WINDOW_OPEN",
    "BOX_CALL",
    "SC_ALERT",
    "SC_BOX_CALL",
    "RAIN_STARTING",
    "RAIN_STOPPING",
    "YELLOW_FLAG",
    "RED_FLAG",
    "POSITION_GAINED",
    "PRESSURE_BEHIND",
    "CLOSE_AHEAD",
    "DRS_AVAILABLE",
    "UNDERCUT_THREAT",
    "GAP_MANAGEMENT",
    "PUSH_MODE",
    "END_PUSH",
    "RACE_END",
    "PRERACE_BRIEF",
]


class RadioGenerator:
    SYSTEM_PROMPT = """You are Xavier Marcos Padros, Charles Leclerc's race engineer at Ferrari. You've worked together for years — you know how he likes feedback and when to push him.

HOW YOU TALK:
- Human and direct. You can say "Charles" or "hey Charles" when it fits. On a good overtake: "Nice one Charles" / "Good job" / "That's the one" then straight into gaps or next job.
- Real engineers stack info: gaps, tyre, pace, weather, strategy — not one vague line. Use what's in the data.
- Warm on the opening laps: settle him in, compound on the car, where he sits, what the first stint looks like. Never cold or robotic.

LENGTH (important):
- Almost every message: **2 or 3 full sentences**. Aim ~35–55 words. You are allowed depth — do not be telegraphic.
- Only BOX_CALL / SC_BOX_CALL / RAIN_STARTING can be slightly shorter when urgency needs it, still clear.

EARLY RACE (laps 1–7):
- **Never** tell him to box, pit, or stop for tyres unless the message type is explicitly SC_BOX_CALL or RAIN_STARTING. No "we'll box soon", no pit windows — he's racing.
- Opening phase = encouragement, rhythm, gaps, track evolution, temps if relevant — not strategy stops.

WEATHER & TRACK:
- Don't just say "it's raining". Say what it means: which sectors, if it's lightening, track temp trend, watch the dry line, aquaplaning risk, how long the model thinks it might last if advisory says so.
- If rain is easing: tell him to watch for grip on the racing line, maybe more push in dry patches — use weather_advisory and rain_risk_trend.

NUMBERS:
- Gaps one decimal: 2.4s. No "about two seconds".
- Never mention laps to go unless under 8 laps left.
- Never say "Leclerc" as if he's someone else. He's Charles; car behind is "car behind" or "P3 is 0.8 back".
- P1: never "gap ahead".
- Skip empty hype words: incredible, amazing, unbelievable, fantastic — but "good job", "nice", "well done", "love it" on real moments is fine.

VOCAB: box not pit, deg not tyre wear, "the hard" not hard tyres.

CRITICAL:
- Never invent numbers — only use data provided.
- RAIN_STARTING: must call box for intermediates.
- BOX_CALL / SC_BOX_CALL: must say box this lap or box next lap clearly."""

    TYPE_INSTRUCTIONS = {
        "RACE_START_SUMMARY": (
            "Laps 1–2 only. Warm, confident open to Charles. "
            "2–3 sentences: good/clean start, P?, compound on the car, gap ahead/behind if not P1, "
            "first stint picture (push when, manage what). "
            "ZERO pit/box/stop language — he's just started. Energy but controlled."
        ),
        "ROUTINE_PACE_NOTE": (
            "2–3 sentences. Weave together the useful facts from the data: gaps (ahead/behind), "
            "deg or tyre age feel, predicted lap vs target if given, SC risk if elevated, "
            "weather or track temp delta if non-zero. "
            "Sound like you're watching every screen — not one fact then silence. "
            "No pit call unless lap is late in race context. Vary content lap to lap."
        ),
        "TYRE_ADVISORY": (
            "2–3 sentences. Deg rate, what it means for the next few laps, where to protect the tyre "
            "(sectors) vs where he can use the tyre. Stay out for now unless type says otherwise."
        ),
        "CLIFF_WARNING": (
            "2–3 sentences. Tyre falling off, deg number, box timing window, where NOT to push. "
            "Urgent but calm."
        ),
        "PIT_WINDOW_OPEN": (
            "2–3 sentences. Window is open — NOT 'box now'. Compound ready, what you're watching "
            "(gap to car behind, rival pit), stay out unless told otherwise."
        ),
        "BOX_CALL": (
            "This is the pit call. Clear, direct, unambiguous. "
            "Say box this lap or box next lap. State the compound going on. "
            "Give the key number (gap ahead or gap behind) so he knows the strategic context."
        ),
        "SC_ALERT": (
            "Safety car probability is elevated but not deployed yet. "
            "Alert Charles so he's mentally prepared. "
            "Don't cry wolf — only say this when probability is genuinely elevated (above 40%)."
        ),
        "SC_BOX_CALL": (
            "Safety car is deployed. This is the most time-critical call in F1. "
            "Tell him SC is out, box immediately, state the compound, and give him the position context."
        ),
        "RAIN_STARTING": (
            "RAIN HAS JUST STARTED. This is an emergency compound change. "
            "Be urgent but clear. Confirm rain, call box immediately, state intermediate compound. "
            "Do NOT mention gaps, stint length, or strategy. Only rain and the box call. "
            "Weather advisory from model: {weather_advisory}"
        ),
        "RAIN_STOPPING": (
            "2–3 sentences. Rain easing or stopped — what he should feel on track, dry line, "
            "track temp if given, rain_risk_trend — slick switch maybe later. Actionable, not vague."
        ),
        "YELLOW_FLAG": (
            "Yellow flag sector ahead. Tell Charles to lift, no overtaking, and be ready for a safety car."
        ),
        "RED_FLAG": (
            "Red flag shown and the race is stopped. Tell Charles to bring the car in slowly "
            "to the pit lane, avoid risks, and that the race will restart. Confirm tyre choice for restart."
        ),
        "POSITION_GAINED": (
            "Lead with congrats — 'Nice one Charles', 'Good job', 'Love that'. "
            "Then 1–2 sentences: new P?, gap ahead, gap behind, what to do next (push, defend, tyres)."
        ),
        "PRESSURE_BEHIND": (
            "Car behind is close and attacking. Tell Charles the gap and give a tactical instruction."
        ),
        "CLOSE_AHEAD": (
            "Gap to car ahead is under 1 second — DRS range. Tell him the gap and to attack."
        ),
        "DRS_AVAILABLE": (
            "Gap to car ahead just dropped under 1.0 second — DRS detection zone coming. "
            "Tell him DRS is available and to attack. Brief and urgent."
        ),
        "UNDERCUT_THREAT": (
            "A competitor behind is likely about to pit for an undercut. Explain the threat and the plan."
        ),
        "GAP_MANAGEMENT": (
            "Charles is leading and the gap is comfortable but needs management. "
            "Tell him the gap and whether to push or conserve."
        ),
        "PUSH_MODE": (
            "Tyres are fresh — time to push and build the gap. Give the current gap and instruct him to push."
        ),
        "END_PUSH": (
            "Final laps of the race. Tell him how many laps are left, his position, and whether to push or manage."
        ),
        "RACE_END": (
            "The race is over. Final position: P{final_position}. "
            "If P1: one sentence of feeling, then acknowledge the team. Otherwise: warm but professional."
        ),
        "PRERACE_BRIEF": "Pre-race strategy brief. Keep it concise and actionable.",
    }

    RELEVANT_FIELDS = {
        "ROUTINE_PACE_NOTE": [
            "position", "gap_ahead", "gap_behind", "tyre_age", "compound_str", "deg_rate",
            "predicted_lap_time", "lap_number", "total_laps", "rainfall", "track_temp",
            "track_temp_delta", "weather_advisory", "rain_risk_trend", "sc_probability",
            "vsc_ratio", "recommended_action", "action_confidence", "median_finish",
            "cliff_probability",
        ],
        "TYRE_ADVISORY": ["tyre_age", "compound_str", "deg_rate", "cliff_probability", "laps_remaining", "gap_behind", "gap_ahead", "position"],
        "CLIFF_WARNING": ["tyre_age", "compound_str", "deg_rate", "cliff_probability", "laps_remaining", "gap_behind"],
        "BOX_CALL": ["position", "gap_ahead", "gap_behind", "tyre_age", "recommended_action", "median_finish", "lap_number"],
        "SC_BOX_CALL": ["position", "sc_reason", "sc_severity", "vsc_ratio", "sc_duration_laps", "gap_behind", "recommended_action"],
        "SC_ALERT": ["sc_probability", "vsc_ratio", "gap_behind", "position", "gap_ahead", "recommended_action"],
        "RAIN_STARTING": ["rainfall", "track_temp", "track_temp_delta", "weather_advisory", "compound_str", "circuit_name"],
        "RAIN_STOPPING": ["track_temp_delta", "rain_risk_trend", "compound_str", "track_temp", "weather_advisory", "rainfall"],
        "POSITION_GAINED": ["position", "positions_gained", "gap_ahead", "gap_behind", "tyre_age", "compound_str"],
        "RACE_END": ["final_position", "lap_number", "total_laps"],
        "CLOSE_AHEAD": ["gap_ahead", "position", "drs_zones_count", "tyre_age"],
        "DRS_AVAILABLE": ["gap_ahead", "position", "drs_zones_count"],
        "PRESSURE_BEHIND": ["gap_behind", "position", "tyre_age", "gap_ahead", "compound_str"],
        "END_PUSH": ["laps_remaining", "position", "gap_ahead", "gap_behind", "tyre_age", "compound_str"],
        "RACE_START_SUMMARY": [
            "position", "compound_str", "total_laps", "circuit_name",
            "gap_ahead", "gap_behind", "tyre_age", "predicted_lap_time",
        ],
        "GAP_MANAGEMENT": ["position", "gap_behind", "tyre_age", "lap_number", "total_laps"],
        "PUSH_MODE": ["position", "gap_behind", "tyre_age"],
        "UNDERCUT_THREAT": ["position", "gap_behind", "tyre_age", "recommended_action"],
        "YELLOW_FLAG": ["lap_number", "position"],
        "RED_FLAG": ["laps_remaining", "position", "compound_str"],
        "PIT_WINDOW_OPEN": ["position", "gap_ahead", "gap_behind", "tyre_age", "recommended_action"],
        "PRERACE_BRIEF": ["circuit_name", "total_laps"],
    }

    def __init__(self):
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            import warnings
            warnings.warn("ANTHROPIC_API_KEY not set; engineer messages will use fallback.")
        try:
            import anthropic
            self.client = anthropic.Anthropic(api_key=api_key)
        except Exception:
            self.client = None

    def _classify_sc_severity(self, context: dict) -> str:
        lap = int(context.get("lap_number", 20))
        circuit = str(context.get("circuit_name", "")).lower()
        rainfall = int(context.get("rainfall", 0) or 0)
        sc_duration = int(context.get("sc_duration_laps", 0) or 0)
        street_bits = (
            "monaco", "baku", "singapore", "marina", "las vegas", "miami", "jeddah"
        )
        is_street = any(s in circuit for s in street_bits)
        if sc_duration >= 5:
            return "major"
        if is_street and sc_duration >= 3:
            return "major"
        if lap <= 2 or rainfall == 1:
            return "moderate"
        if sc_duration >= 3:
            return "moderate"
        return "minor"

    def determine_message_type(
        self, context: dict, recent_types: list[str] | None = None
    ) -> MessageType:
        if recent_types is None:
            recent_types = []

        if context.get("is_race_end"):
            return "RACE_END"

        lap = int(context.get("lap_number", 1) or 1)
        # No pit calls in opening laps — model/API can wrongly flag lap 1.
        MIN_LAP_BOX = 10
        MIN_LAP_PIT_WINDOW = 9
        MIN_LAP_CLIFF = 12
        MIN_LAP_TYRE_ADVISORY = 7

        if context.get("is_actual_pit_lap") and lap >= 8:
            return "BOX_CALL"

        sc_active = bool(context.get("sc_active", False))
        sc_just = bool(context.get("sc_just_deployed", False))
        sc_prob = context.get("sc_probability", 0.0)
        cliff_prob = context.get("cliff_probability", 0.0)
        deg_rate = context.get("deg_rate", 0.0)
        tyre_age = context.get("tyre_age", 0)
        action = context.get("recommended_action", "STAY_OUT")
        confidence = context.get("action_confidence", 0.0)
        gap_ahead = context.get("gap_ahead", 99.0)
        gap_behind = context.get("gap_behind", 99.0)
        total = context.get("total_laps", 57)
        laps_remaining = total - lap
        position = context.get("position", 10)
        rainfall = context.get("rainfall", 0)
        rainfall_changed = context.get("rainfall_changed", False)
        drs_zones_count = context.get("drs_zones_count", 1)

        # Red flag detection: race stopped (extreme lap times) with plenty of laps left.
        laps_remaining = int(context.get("laps_remaining", laps_remaining) or laps_remaining)
        try:
            pred_lt = float(context.get("predicted_lap_time", 0) or 0)
        except (TypeError, ValueError):
            pred_lt = 0.0
        if laps_remaining > 5 and pred_lt >= 180 and context.get("race_stopped", True):
            return "RED_FLAG"

        # One warm race-open: first time we talk on lap 1 or 2 only.
        if lap <= 2 and "RACE_START_SUMMARY" not in recent_types:
            return "RACE_START_SUMMARY"

        recent_box_count = recent_types.count("BOX_CALL")
        recent_sc_box = "SC_BOX_CALL" in recent_types[:2]

        if rainfall_changed and rainfall == 1:
            return "RAIN_STARTING"

        # Safety car handling: call it out immediately if just deployed; otherwise avoid repeating box calls.
        if sc_just and not recent_sc_box:
            if isinstance(action, str) and action.startswith("PIT_") and float(confidence or 0) >= 0.55:
                return "SC_BOX_CALL"
            return "SC_ALERT"

        if sc_active and not sc_just:
            # If SC stays active across laps, avoid calling box repeatedly; treat as caution/yellow context.
            if "SC_BOX_CALL" in recent_types[:2]:
                return "SC_ALERT"
            return "YELLOW_FLAG"

        if rainfall_changed and rainfall == 0:
            return "RAIN_STOPPING"

        if (
            lap >= MIN_LAP_BOX
            and action in ["PIT_SOFT", "PIT_MEDIUM", "PIT_HARD"]
            and confidence > 0.78
            and tyre_age > 20
            and recent_box_count == 0
            and "BOX_CALL" not in recent_types[:4]
        ):
            return "BOX_CALL"

        if (
            lap >= MIN_LAP_CLIFF
            and cliff_prob > 0.30
            and tyre_age > 18
            and "CLIFF_WARNING" not in recent_types[:2]
        ):
            return "CLIFF_WARNING"

        if sc_prob > 0.40 and "SC_ALERT" not in recent_types[:3]:
            return "SC_ALERT"

        if (
            context.get("position_gained")
            and context.get("positions_gained", 0) > 0
            and lap >= 2
            and "POSITION_GAINED" not in recent_types[:3]
        ):
            return "POSITION_GAINED"

        if (
            position > 1
            and 0 < gap_ahead <= 1.0
            and drs_zones_count > 0
            and "DRS_AVAILABLE" not in recent_types[:3]
        ):
            return "DRS_AVAILABLE"

        # PIT_WINDOW_OPEN
        if (
            lap >= MIN_LAP_PIT_WINDOW
            and action in ["PIT_SOFT", "PIT_MEDIUM", "PIT_HARD"]
            and confidence > 0.55
            and tyre_age > 14
            and "PIT_WINDOW_OPEN" not in recent_types[:3]
            and "BOX_CALL" not in recent_types[:5]
        ):
            return "PIT_WINDOW_OPEN"

        # CLOSE_AHEAD
        if 0 < gap_ahead < 1.2 and "CLOSE_AHEAD" not in recent_types[:2]:
            return "CLOSE_AHEAD"

        # PRESSURE_BEHIND
        if gap_behind < 0.8 and "PRESSURE_BEHIND" not in recent_types[:2]:
            return "PRESSURE_BEHIND"

        # TYRE_ADVISORY
        if (
            lap >= MIN_LAP_TYRE_ADVISORY
            and (deg_rate > 0.18 or tyre_age > 22)
            and "TYRE_ADVISORY" not in recent_types[:3]
        ):
            return "TYRE_ADVISORY"

        # END_PUSH
        if laps_remaining <= 5 and "END_PUSH" not in recent_types[:3]:
            return "END_PUSH"

        return "ROUTINE_PACE_NOTE"

    def build_user_prompt(self, context: dict, message_type: MessageType) -> str:
        def _fmt_gap(v: object) -> str:
            try:
                return f"{float(v):.1f}"
            except Exception:
                return "0.0"

        def _fmt_prob(v: object) -> str:
            try:
                return f"{float(v) * 100:.0f}%"
            except Exception:
                return "0%"

        def _fmt_float(v: object, places: int = 2) -> str:
            try:
                return f"{float(v):.{places}f}"
            except Exception:
                return "0.00"

        ctx = dict(context or {})
        # Normalize a few keys so the prompt shape stays stable.
        if "track_temp" not in ctx and "track_temp_celsius" in ctx:
            ctx["track_temp"] = ctx.get("track_temp_celsius")
        if "laps_remaining" not in ctx and "lap_number" in ctx and "total_laps" in ctx:
            try:
                ctx["laps_remaining"] = int(ctx.get("total_laps", 0)) - int(ctx.get("lap_number", 0))
            except Exception:
                ctx["laps_remaining"] = None

        fields = self.RELEVANT_FIELDS.get(message_type, [])
        instr = self.TYPE_INSTRUCTIONS.get(message_type, "")

        lines = [f"Message type: {message_type}", f"Instructions: {instr}", "Data:"]
        for k in fields:
            v = ctx.get(k)
            if k in ("gap_ahead", "gap_behind"):
                lines.append(f"- {k}: {_fmt_gap(v)}")
            elif k in ("sc_probability", "cliff_probability"):
                lines.append(f"- {k}: {_fmt_prob(v)}")
            elif k == "deg_rate":
                lines.append(f"- {k}: {_fmt_float(v, 2)}")
            elif k == "predicted_lap_time":
                lines.append(f"- {k}: {_fmt_float(v, 1)}")
            else:
                lines.append(f"- {k}: {v}")

        try:
            ln = int(ctx.get("lap_number", 1) or 1)
        except (TypeError, ValueError):
            ln = 1
        if message_type == "RACE_START_SUMMARY":
            lines.append(
                "MANDATORY: Zero pit language — do not say box, pit, stop, or call him in. "
                "Warm open only."
            )
        elif message_type == "ROUTINE_PACE_NOTE" and ln < 9:
            lines.append(
                "Early race: still no pit/box calls — gaps, pace, tyres, weather, SC watch only."
            )
        elif message_type == "ROUTINE_PACE_NOTE" and int(ctx.get("rainfall", 0) or 0) == 1:
            lines.append(
                "Wet or damp: explain what he's feeling and what to watch — not one word 'rain'."
            )

        lines.append(
            "Generate the radio message now. 2–3 sentences unless type is an urgent box call. "
            "Use the data; sound human."
        )
        return "\n".join(lines)

    def generate_message_with_type(
        self, context: dict, recent_types: list[str] | None, message_type: str
    ) -> dict:
        if recent_types is None:
            recent_types = []
        return self._emit_message(context, message_type, recent_types)

    def generate_message(self, context: dict, recent_types: list[str] | None = None) -> dict:
        if recent_types is None:
            recent_types = []
        ctx = dict(context)
        if ctx.get("sc_active") and not ctx.get("sc_severity"):
            ctx["sc_severity"] = self._classify_sc_severity(ctx)
        message_type = self.determine_message_type(ctx, recent_types)
        return self._emit_message(ctx, message_type, recent_types)

    def _emit_message(self, context: dict, message_type: str, recent_types: list[str]) -> dict:
        user_prompt = self.build_user_prompt(context, message_type)
        urgency_map = {
            "ROUTINE_PACE_NOTE": "ROUTINE",
            "TYRE_ADVISORY": "ADVISORY",
            "CLIFF_WARNING": "ADVISORY",
            "SC_ALERT": "ADVISORY",
            "SC_BOX_CALL": "URGENT",
            "PIT_WINDOW_OPEN": "ADVISORY",
            "BOX_CALL": "URGENT",
            "CLOSE_AHEAD": "ADVISORY",
            "PRESSURE_BEHIND": "ADVISORY",
            "END_PUSH": "ROUTINE",
            "RACE_START_SUMMARY": "ROUTINE",
            "PRERACE_BRIEF": "ROUTINE",
            "RAIN_STARTING": "URGENT",
            "RAIN_STOPPING": "ADVISORY",
            "POSITION_GAINED": "ROUTINE",
            "RACE_END": "ROUTINE",
            "DRS_AVAILABLE": "ADVISORY",
            "YELLOW_FLAG": "ADVISORY",
            "RED_FLAG": "URGENT",
            "UNDERCUT_THREAT": "ADVISORY",
            "GAP_MANAGEMENT": "ROUTINE",
            "PUSH_MODE": "ADVISORY",
        }
        if not self.client:
            if message_type == "RAIN_STARTING":
                return {
                    "message": "Rain confirmed. Box this lap. Intermediates on.",
                    "urgency": "URGENT",
                    "message_type": message_type,
                    "lap_number": context.get("lap_number", 0),
                }
            if message_type == "SC_BOX_CALL":
                comp = str(context.get("recommended_action", "PIT_HARD")).replace("PIT_", "").upper()
                return {
                    "message": f"Charles, safety car out — box box box, box this lap. {comp} compound.",
                    "urgency": "URGENT",
                    "message_type": message_type,
                    "lap_number": context.get("lap_number", 0),
                }
            if message_type == "RACE_END":
                fp = int(context.get("final_position", context.get("position", 1)))
                if fp == 1:
                    msg = "Race win, Charles. Brilliant job from everyone."
                elif fp in (2, 3):
                    msg = f"P{fp}. Solid race, good points."
                else:
                    msg = f"P{fp}. Thank you for the effort."
                return {
                    "message": msg,
                    "urgency": "ROUTINE",
                    "message_type": message_type,
                    "lap_number": context.get("lap_number", 0),
                }
            return {
                "message": "Copy that. Monitoring.",
                "urgency": urgency_map.get(message_type, "ROUTINE"),
                "message_type": message_type,
                "lap_number": context.get("lap_number", 0),
            }
        try:
            max_tokens = (
                200
                if message_type
                in ("ROUTINE_PACE_NOTE", "RACE_START_SUMMARY", "TYRE_ADVISORY", "RAIN_STOPPING")
                else 160
            )
            response = self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=max_tokens,
                system=self.SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
            message_text = response.content[0].text.strip()
            # Clean common formatting issues.
            message_text = message_text.strip().strip('"').strip("'").strip()
            message_text = re.sub(r"(\d)\s*\.\s*(\d)", r"\1.\2", message_text)

            # Enforce sentence limit (max 3) without breaking decimals like "2.4".
            parts = re.split(r"(?<=[!?])\s+|(?<!\d)\.(?!\d)\s+", message_text)
            sentences = [p.strip() for p in parts if p and p.strip()]
            if len(sentences) > 3:
                message_text = ". ".join(sentences[:3]).strip()
                if not re.search(r"[.!?]$", message_text):
                    message_text += "."
        except Exception:
            message_text = "Copy that. Monitoring."

        # Never pit talk on race open — model sometimes ignores.
        if message_type == "RACE_START_SUMMARY":
            lt = message_text.lower()
            if re.search(r"\bbox\b|\bpit\b", lt) and "intermediate" not in lt:
                pos = int(context.get("position", 2) or 2)
                comp = str(context.get("compound_str", "MEDIUM") or "MEDIUM")
                ga = context.get("gap_ahead")
                gb = context.get("gap_behind")
                try:
                    gbs = f"{float(gb):.1f}" if gb is not None else None
                except (TypeError, ValueError):
                    gbs = None
                try:
                    gas = f"{float(ga):.1f}" if ga is not None and pos > 1 else None
                except (TypeError, ValueError):
                    gas = None
                parts = [
                    f"Hey Charles, clean start — you're P{pos} on the {comp}.",
                    "Let's find a rhythm this stint; tyres are fresh so build into it.",
                ]
                if pos > 1 and gas:
                    parts.append(f"Gap ahead is {gas}s — no rush early.")
                elif gbs:
                    parts.append(f"Gap behind is {gbs}s, you're in a good place.")
                message_text = " ".join(parts[:3])

        # Hard safety/format requirements for certain message types.
        def _compound_from_ctx() -> str:
            ra = str(context.get("recommended_action", "") or "")
            if ra.startswith("PIT_"):
                return ra.replace("PIT_", "").replace("_", " ").lower()
            cs = str(context.get("compound_str", "") or "")
            if cs:
                return cs.replace("_", " ").lower()
            return "hard"

        if message_type == "SC_BOX_CALL":
            comp = _compound_from_ctx()
            lt = message_text.lower()
            if ("box box box" not in lt) or ("safety car" not in lt):
                message_text = f"Charles, safety car out — box box box, box this lap. {comp} compound."
            lt = message_text.lower()
            if "box this lap" not in lt and "box next lap" not in lt:
                message_text = f"Charles, safety car out — box box box, box this lap. {comp} compound."

        if message_type == "BOX_CALL":
            lt = message_text.lower()
            if "box this lap" not in lt and "box next lap" not in lt:
                comp = _compound_from_ctx()
                message_text = f"Box this lap, box this lap. {comp} compound."

        if message_type == "RAIN_STARTING":
            lt = message_text.lower()
            if "box" not in lt or "inter" not in lt:
                message_text = (
                    "Rain confirmed Charles, track is wet. "
                    "Box this lap, box this lap — intermediates going on. "
                    "Bring it in carefully through sector one."
                )
        return {
            "message": message_text,
            "urgency": urgency_map.get(message_type, "ROUTINE"),
            "message_type": message_type,
            "lap_number": context.get("lap_number", 0),
        }

    def generate_prerace_brief(self, context: dict) -> dict:
        """Pre-race strategy brief. Returns {opening_message, recommended, alternative_1, alternative_2}."""
        compound_name = {0: "SOFT", 1: "MEDIUM", 2: "HARD", 3: "INTERMEDIATE", 4: "WET"}
        comps = context.get("available_compounds", [0, 1, 2])
        comp_str = ", ".join(compound_name.get(c, "?") for c in comps)
        tl = context.get("total_laps", 57)
        user_prompt = f"""Pre-race brief: {context.get('circuit_name', 'Unknown')} GP, {tl} laps. Tyres: {comp_str}. Circuit SC rate: {(context.get('circuit_sc_rate') or 0.3)*100:.0f}%. Recommended: {context.get('recommended_strategy_description', 'Two-stop Medium-Hard')}. EFP: P{context.get('expected_finish_recommended', 3)}.
First write Xavier's opening radio message to Charles (max 3 sentences). Then output a JSON block in ```json ... ``` with: "opening_message", "recommended": {{compounds, stint_lengths, expected_position, rationale}}, "alternative_1", "alternative_2" same shape."""

        if not self.client:
            return {
                "opening_message": "Strategy confirmed. We'll review after formation lap.",
                "recommended": {"compounds": ["MEDIUM", "HARD"], "stint_lengths": [28, 29], "expected_position": 3, "rationale": "Standard two-stop."},
                "alternative_1": {"compounds": ["SOFT", "MEDIUM", "HARD"], "stint_lengths": [18, 22, 17], "expected_position": 4, "rationale": "Aggressive early."},
                "alternative_2": {"compounds": ["MEDIUM", "SOFT"], "stint_lengths": [30, 27], "expected_position": 3, "rationale": "Conservative."},
            }
        try:
            response = self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=450,
                system=self.SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
            raw = response.content[0].text.strip()
        except Exception:
            raw = ""
        json_match = re.search(r"```json\s*(.*?)\s*```", raw, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass
        return {
            "opening_message": raw[:300] if raw else "Strategy confirmed.",
            "recommended": {"compounds": ["MEDIUM", "HARD"], "stint_lengths": [28, 29], "expected_position": 3, "rationale": "Standard."},
            "alternative_1": {"compounds": ["SOFT", "MEDIUM", "HARD"], "stint_lengths": [18, 22, 17], "expected_position": 4, "rationale": "Aggressive."},
            "alternative_2": {"compounds": ["MEDIUM", "SOFT"], "stint_lengths": [30, 27], "expected_position": 3, "rationale": "Conservative."},
        }
