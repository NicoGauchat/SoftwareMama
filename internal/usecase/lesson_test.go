package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"softwaremama/internal/domain"
)

type lessonRepoStub struct {
	lesson  domain.Lesson
	updated domain.Lesson
}

func (repo *lessonRepoStub) Create(context.Context, domain.Lesson) error { return nil }
func (repo *lessonRepoStub) GetByID(context.Context, uuid.UUID) (domain.Lesson, error) {
	return repo.lesson, nil
}
func (repo *lessonRepoStub) Update(_ context.Context, lesson domain.Lesson) error {
	repo.updated = lesson
	return nil
}
func (repo *lessonRepoStub) Delete(context.Context, uuid.UUID) error { return nil }
func (repo *lessonRepoStub) ListByDate(context.Context, time.Time) ([]domain.Lesson, error) {
	return nil, nil
}
func (repo *lessonRepoStub) ListBetween(context.Context, time.Time, time.Time) ([]domain.Lesson, error) {
	return nil, nil
}

type studentRepoStub struct{ student domain.Student }

func (repo *studentRepoStub) Create(context.Context, domain.Student) error { return nil }
func (repo *studentRepoStub) GetByID(context.Context, uuid.UUID) (domain.Student, error) {
	return repo.student, nil
}
func (repo *studentRepoStub) List(context.Context) ([]domain.Student, error) { return nil, nil }
func (repo *studentRepoStub) Update(context.Context, domain.Student) error   { return nil }
func (repo *studentRepoStub) Delete(context.Context, uuid.UUID) error        { return nil }

func TestCompleteLessonAbsenceChargingRules(t *testing.T) {
	studentID := uuid.New()
	student := domain.Student{ID: studentID, HourlyRate: 6000, IsActive: true}

	tests := []struct {
		name              string
		attendance        domain.Attendance
		wantAmount        float64
		wantPaymentStatus domain.PaymentStatus
	}{
		{
			name:              "unexcused absence is charged",
			attendance:        domain.AttendanceAbsentUnexcused,
			wantAmount:        6000,
			wantPaymentStatus: domain.PaymentStatusPending,
		},
		{
			name:              "excused absence is not charged",
			attendance:        domain.AttendanceAbsentExcused,
			wantAmount:        0,
			wantPaymentStatus: domain.PaymentStatusPending,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			lessonID := uuid.New()
			lessons := &lessonRepoStub{lesson: domain.Lesson{
				ID:         lessonID,
				StudentID:  studentID,
				Status:     domain.LessonStatusScheduled,
				HourlyRate: 6000,
			}}
			students := &studentRepoStub{student: student}
			service := NewCompleteLesson(lessons, students)

			got, err := service.Execute(context.Background(), CompleteLessonInput{
				LessonID:            lessonID,
				RealDurationMinutes: 60,
				Attendance:          test.attendance,
				PaymentStatus:       domain.PaymentStatusPaid,
				PaymentMethod:       domain.PaymentMethodCash,
			})
			if err != nil {
				t.Fatalf("Execute() error = %v", err)
			}
			if got.Amount != test.wantAmount {
				t.Fatalf("Amount = %v, want %v", got.Amount, test.wantAmount)
			}
			if got.PaymentStatus != test.wantPaymentStatus {
				t.Fatalf("PaymentStatus = %q, want %q", got.PaymentStatus, test.wantPaymentStatus)
			}
			if got.PaidAmount != 0 {
				t.Fatalf("PaidAmount = %v, want 0", got.PaidAmount)
			}
			if got.PaymentMethod != "" {
				t.Fatalf("PaymentMethod = %q, want empty", got.PaymentMethod)
			}
		})
	}
}
