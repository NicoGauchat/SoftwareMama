package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"softwaremama/internal/domain"
	"softwaremama/internal/repository"
)

type CompleteLessonInput struct {
	LessonID            uuid.UUID
	RealDurationMinutes int
	Attendance          domain.Attendance
	PaymentStatus       domain.PaymentStatus
	PaymentMethod       domain.PaymentMethod
	TopicNotes          string
}

type CompleteLessonUseCase interface {
	Execute(context.Context, CompleteLessonInput) (domain.Lesson, error)
}

type completeLesson struct {
	lessons  repository.LessonRepository
	students repository.StudentRepository
}

func NewCompleteLesson(lessons repository.LessonRepository, students repository.StudentRepository) CompleteLessonUseCase {
	return &completeLesson{lessons: lessons, students: students}
}

func (uc *completeLesson) Execute(ctx context.Context, input CompleteLessonInput) (domain.Lesson, error) {
	if input.RealDurationMinutes <= 0 || !validAttendance(input.Attendance) || !validPaymentStatus(input.PaymentStatus) {
		return domain.Lesson{}, fmt.Errorf("complete lesson: %w", domain.ErrInvalidInput)
	}
	if input.Attendance == domain.AttendancePresent && input.PaymentStatus == domain.PaymentStatusPaid && !validPaymentMethod(input.PaymentMethod) {
		return domain.Lesson{}, fmt.Errorf("complete lesson: %w", domain.ErrInvalidInput)
	}
	lesson, err := uc.lessons.GetByID(ctx, input.LessonID)
	if err != nil {
		return domain.Lesson{}, fmt.Errorf("get lesson: %w", err)
	}
	if lesson.Status != domain.LessonStatusScheduled && lesson.Status != domain.LessonStatusCompleted {
		return domain.Lesson{}, fmt.Errorf("complete lesson: %w", domain.ErrInvalidState)
	}
	student, err := uc.students.GetByID(ctx, lesson.StudentID)
	if err != nil {
		return domain.Lesson{}, fmt.Errorf("get student: %w", err)
	}
	if !student.IsActive || student.HourlyRate < 0 {
		return domain.Lesson{}, fmt.Errorf("complete lesson: %w", domain.ErrInvalidState)
	}

	lesson.Status = domain.LessonStatusCompleted
	lesson.RealDurationMinutes = input.RealDurationMinutes
	lesson.Attendance = input.Attendance
	lesson.PaymentStatus = input.PaymentStatus
	lesson.TopicNotes = input.TopicNotes
	if input.Attendance == domain.AttendanceAbsentExcused {
		lesson.Amount = 0
		lesson.PaidAmount = 0
		lesson.PaymentMethod = ""
		lesson.PaymentStatus = domain.PaymentStatusPending
	} else {
		rate := lesson.HourlyRate
		if rate <= 0 {
			rate = student.HourlyRate
		}
		lesson.Amount = rate * float64(input.RealDurationMinutes) / 60
		if input.Attendance == domain.AttendancePresent && input.PaymentStatus == domain.PaymentStatusPaid {
			lesson.PaidAmount = lesson.Amount
			lesson.PaymentMethod = input.PaymentMethod
		} else {
			lesson.PaidAmount = 0
			lesson.PaymentMethod = ""
			lesson.PaymentStatus = domain.PaymentStatusPending
		}
	}
	if err := uc.lessons.Update(ctx, lesson); err != nil {
		return domain.Lesson{}, fmt.Errorf("update lesson: %w", err)
	}
	return lesson, nil
}

type GetDailyLessonsUseCase interface {
	Execute(context.Context, time.Time) ([]domain.Lesson, error)
}

type getDailyLessons struct{ lessons repository.LessonRepository }

func NewGetDailyLessons(lessons repository.LessonRepository) GetDailyLessonsUseCase {
	return &getDailyLessons{lessons: lessons}
}

func (uc *getDailyLessons) Execute(ctx context.Context, date time.Time) ([]domain.Lesson, error) {
	if date.IsZero() {
		return nil, fmt.Errorf("daily lessons: %w", domain.ErrInvalidInput)
	}
	lessons, err := uc.lessons.ListByDate(ctx, date)
	if err != nil {
		return nil, fmt.Errorf("daily lessons: %w", err)
	}
	return lessons, nil
}

// RescheduleLesson moves a concrete lesson only; it never changes the weekly template.
type RescheduleLessonUseCase interface {
	Execute(context.Context, uuid.UUID, time.Time) (domain.Lesson, error)
}
type rescheduleLesson struct{ lessons repository.LessonRepository }

func NewRescheduleLesson(lessons repository.LessonRepository) RescheduleLessonUseCase {
	return &rescheduleLesson{lessons}
}
func (uc *rescheduleLesson) Execute(ctx context.Context, id uuid.UUID, newDate time.Time) (domain.Lesson, error) {
	if newDate.IsZero() {
		return domain.Lesson{}, fmt.Errorf("reschedule lesson: %w", domain.ErrInvalidInput)
	}
	lesson, err := uc.lessons.GetByID(ctx, id)
	if err != nil {
		return domain.Lesson{}, err
	}
	if lesson.Status != domain.LessonStatusScheduled {
		return domain.Lesson{}, fmt.Errorf("reschedule lesson: %w", domain.ErrInvalidState)
	}
	lesson.Date = newDate
	if err := uc.lessons.Update(ctx, lesson); err != nil {
		return domain.Lesson{}, err
	}
	return lesson, nil
}

type CancelLessonUseCase interface {
	Execute(context.Context, uuid.UUID) (domain.Lesson, error)
}
type cancelLesson struct{ lessons repository.LessonRepository }

func NewCancelLesson(lessons repository.LessonRepository) CancelLessonUseCase {
	return &cancelLesson{lessons}
}
func (uc *cancelLesson) Execute(ctx context.Context, id uuid.UUID) (domain.Lesson, error) {
	lesson, err := uc.lessons.GetByID(ctx, id)
	if err != nil {
		return domain.Lesson{}, err
	}
	if lesson.Status != domain.LessonStatusScheduled {
		return domain.Lesson{}, fmt.Errorf("cancel lesson: %w", domain.ErrInvalidState)
	}
	lesson.Status = domain.LessonStatusCancelled
	if err := uc.lessons.Update(ctx, lesson); err != nil {
		return domain.Lesson{}, err
	}
	return lesson, nil
}

func validAttendance(v domain.Attendance) bool {
	return v == domain.AttendancePresent || v == domain.AttendanceAbsentExcused || v == domain.AttendanceAbsentUnexcused
}
func validPaymentStatus(v domain.PaymentStatus) bool {
	return v == domain.PaymentStatusPaid || v == domain.PaymentStatusPending
}

func validPaymentMethod(v domain.PaymentMethod) bool {
	return v == domain.PaymentMethodCash || v == domain.PaymentMethodTransfer
}
