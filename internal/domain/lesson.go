package domain

import (
	"time"

	"github.com/google/uuid"
)

type LessonStatus string

const (
	LessonStatusScheduled LessonStatus = "scheduled"
	LessonStatusCompleted LessonStatus = "completed"
	LessonStatusCancelled LessonStatus = "cancelled"
)

type Attendance string

const (
	AttendancePresent         Attendance = "present"
	AttendanceAbsentExcused   Attendance = "absent_excused"
	AttendanceAbsentUnexcused Attendance = "absent_unexcused"
)

type PaymentStatus string

const (
	PaymentStatusPaid    PaymentStatus = "paid"
	PaymentStatusPending PaymentStatus = "pending"
)

type PaymentMethod string

const (
	PaymentMethodCash     PaymentMethod = "cash"
	PaymentMethodTransfer PaymentMethod = "transfer"
	PaymentMethodMixed    PaymentMethod = "mixed"
)

type Lesson struct {
	ID                  uuid.UUID
	StudentID           uuid.UUID
	Date                time.Time
	RealDurationMinutes int
	Status              LessonStatus
	Attendance          Attendance
	PaymentStatus       PaymentStatus
	Amount              float64
	HourlyRate          float64
	PaidAmount          float64
	PaymentMethod       PaymentMethod
	TopicNotes          string
}
