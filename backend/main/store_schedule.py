"""Validated opening sessions; empty schedules keep the legacy daily hours."""
import re
from rest_framework.exceptions import ValidationError


def validate_weekly_hours(value):
    if value == []:
        return value
    if not isinstance(value, list) or len(value) != 7:
        raise ValidationError("Jadwal harus memuat tujuh hari.")
    days, intervals = set(), []
    for entry in value:
        if not isinstance(entry, dict):
            raise ValidationError("Format hari tidak valid.")
        day = entry.get("day")
        if type(day) is not int or day not in range(7) or day in days:
            raise ValidationError("Hari harus unik dari Senin sampai Minggu.")
        days.add(day)
        enabled, sessions = entry.get("enabled"), entry.get("sessions")
        if type(enabled) is not bool or not isinstance(sessions, list) or len(sessions) > 3 or (enabled and not sessions):
            raise ValidationError("Hari buka memerlukan 1–3 sesi waktu.")
        for session in sessions:
            if not isinstance(session, dict):
                raise ValidationError("Format sesi tidak valid.")
            times = [session.get(key) for key in ["start", "end"]]
            if any(not isinstance(t, str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", t) for t in times):
                raise ValidationError("Jam harus berupa HH:MM.")
            start, end = [int(t[:2]) * 60 + int(t[3:]) for t in times]
            if start == end:
                raise ValidationError("Jam mulai dan selesai harus berbeda.")
            if end < start:
                end += 1440
            if enabled:
                intervals.append((day * 1440 + start, day * 1440 + end))
    ordered = sorted(intervals + [(a + 10080, b + 10080) for a, b in intervals])
    if any(a[1] > b[0] for a, b in zip(ordered, ordered[1:])):
        raise ValidationError("Sesi jam buka tidak boleh tumpang tindih.")
    return sorted(value, key=lambda entry: entry["day"])
