package domain

import (
	"time"

	"github.com/google/uuid"
)

// BaseSchedule is the recurring template. Lessons remain independent once created.
type BaseSchedule struct {
	ID              uuid.UUID
	StudentID       uuid.UUID
	DayOfWeek       time.Weekday
	StartTime       time.Time
	DurationMinutes int
}
