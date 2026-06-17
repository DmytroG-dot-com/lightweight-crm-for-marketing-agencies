"use client";

import { useState } from "react";
import { TaskDateRangePicker } from "@/components/task-date-range-picker";

export function FormDateRangePicker({
  startName,
  dueName,
  defaultStartDate,
  defaultDueDate,
}: {
  startName: string;
  dueName: string;
  defaultStartDate: string;
  defaultDueDate: string;
}) {
  const [dates, setDates] = useState({ start: defaultStartDate, due: defaultDueDate });

  return (
    <div className="md:col-span-2 xl:col-span-2">
      <p className="mb-1.5 text-sm font-medium">First occurrence dates</p>
      <input type="hidden" name={startName} value={dates.start} readOnly />
      <input type="hidden" name={dueName} value={dates.due} readOnly />
      <TaskDateRangePicker
        startDate={dates.start}
        dueDate={dates.due}
        allowClear={false}
        onChange={(start, due) => setDates({ start, due })}
      />
    </div>
  );
}
