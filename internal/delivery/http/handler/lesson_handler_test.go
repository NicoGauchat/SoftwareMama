package handler

import (
	"testing"

	"softwaremama/internal/domain"
)

func TestPayableRemainingAcceptsUnexcusedAbsence(t *testing.T) {
	lesson := domain.Lesson{
		Status:        domain.LessonStatusCompleted,
		Attendance:    domain.AttendanceAbsentUnexcused,
		Amount:        6000,
		PaidAmount:    1000,
		PaymentStatus: domain.PaymentStatusPending,
	}

	remaining, valid := payableRemaining(lesson)
	if !valid {
		t.Fatal("payableRemaining() valid = false, want true")
	}
	if remaining != 5000 {
		t.Fatalf("payableRemaining() = %v, want 5000", remaining)
	}
}

func TestPayableRemainingRejectsExcusedAbsence(t *testing.T) {
	lesson := domain.Lesson{
		Status:     domain.LessonStatusCompleted,
		Attendance: domain.AttendanceAbsentExcused,
		Amount:     0,
	}

	if _, valid := payableRemaining(lesson); valid {
		t.Fatal("payableRemaining() valid = true, want false")
	}
}
