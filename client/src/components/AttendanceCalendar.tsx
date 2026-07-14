import { useState } from "react";
import { addMonths, endOfMonth, format, getDay, startOfMonth } from "date-fns";
import { DayAttendance, DayStatus } from "@/api/attendance";
import { Card } from "@/components/Card";

const STATUS_STYLES: Record<DayStatus, string> = {
  ON_TIME: "bg-green-100 text-green-700",
  LATE: "bg-amber-100 text-amber-700",
  ABSENT: "bg-red-100 text-red-700",
  DAY_OFF: "bg-gray-100 text-gray-400",
  FUTURE: "bg-transparent text-muted-foreground",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
};

const STATUS_LABELS: Record<DayStatus, string> = {
  ON_TIME: "On time",
  LATE: "Late",
  ABSENT: "Absent",
  DAY_OFF: "Day off",
  FUTURE: "Upcoming",
  IN_PROGRESS: "Today (in progress)",
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  month: Date;
  onMonthChange: (month: Date) => void;
  days: DayAttendance[] | undefined;
  isLoading?: boolean;
}

export function AttendanceCalendar({ month, onMonthChange, days, isLoading }: Props) {
  const [hovered, setHovered] = useState<DayAttendance | null>(null);
  const leadingBlanks = getDay(startOfMonth(month));

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Attendance — {format(month, "MMMM yyyy")}</h2>
        <div className="flex gap-2 text-xs">
          <button
            className="rounded-md px-2 py-1 hover:bg-muted"
            onClick={() => onMonthChange(startOfMonth(addMonths(month, -1)))}
          >
            ← Prev
          </button>
          <button
            className="rounded-md px-2 py-1 hover:bg-muted"
            onClick={() => onMonthChange(startOfMonth(addMonths(month, 1)))}
            disabled={startOfMonth(month) >= startOfMonth(new Date())}
          >
            Next →
          </button>
        </div>
      </div>

      {isLoading || !days ? (
        <p className="text-sm text-muted-foreground">Loading attendance...</p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="py-1 font-medium">
                {d}
              </div>
            ))}
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {days.map((day) => (
              <button
                key={day.date}
                onMouseEnter={() => setHovered(day)}
                onMouseLeave={() => setHovered((h) => (h?.date === day.date ? null : h))}
                className={`aspect-square rounded-md text-sm font-medium ${STATUS_STYLES[day.status]}`}
                title={`${STATUS_LABELS[day.status]} — in ${formatTime(day.firstLoginAt)}, out ${formatTime(day.lastLogoutAt)}`}
              >
                {Number(day.date.slice(-2))}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {(Object.keys(STATUS_LABELS) as DayStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${STATUS_STYLES[s]}`} />
                {STATUS_LABELS[s]}
              </span>
            ))}
          </div>

          {hovered && (
            <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs">
              <span className="font-medium">{hovered.date}</span> — {STATUS_LABELS[hovered.status]}
              {hovered.isWorkDay && (
                <>
                  {" "}
                  · In: {formatTime(hovered.firstLoginAt)} · Out: {formatTime(hovered.lastLogoutAt)} · Active:{" "}
                  {hovered.activeMinutes}m
                </>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
