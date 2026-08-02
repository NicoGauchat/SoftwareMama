package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"softwaremama/internal/domain"
)

type StudentRepository interface {
	Create(context.Context, domain.Student) error
	GetByID(context.Context, uuid.UUID) (domain.Student, error)
	List(context.Context) ([]domain.Student, error)
	Update(context.Context, domain.Student) error
	Delete(context.Context, uuid.UUID) error
}

type AcademicRepository interface {
	ListSchools(context.Context) ([]domain.School, error)
	CreateSchool(context.Context, domain.School) error
	UpdateSchool(context.Context, domain.School) error
	DeleteSchool(context.Context, uuid.UUID) error
	ListSchoolGroups(context.Context) ([]domain.SchoolGroup, error)
	CreateSchoolGroup(context.Context, domain.SchoolGroup) error
	DeleteSchoolGroup(context.Context, uuid.UUID) error
	ListSubjects(context.Context, uuid.UUID) ([]domain.Subject, error)
	CreateSubject(context.Context, domain.Subject) error
	DeleteSubject(context.Context, uuid.UUID) error
	ListAssessments(context.Context, uuid.UUID) ([]domain.Assessment, error)
	CreateAssessment(context.Context, domain.Assessment) error
	CreateAssessmentForGrade(context.Context, uuid.UUID, string, domain.Assessment) error
	DeleteAssessment(context.Context, uuid.UUID) error
	ListStudentAssessments(context.Context, uuid.UUID) ([]domain.StudentAssessment, error)
	CreateStudentAssessment(context.Context, domain.StudentAssessment) error
	DeleteStudentAssessment(context.Context, uuid.UUID) error
}

type LessonRepository interface {
	Create(context.Context, domain.Lesson) error
	GetByID(context.Context, uuid.UUID) (domain.Lesson, error)
	Update(context.Context, domain.Lesson) error
	Delete(context.Context, uuid.UUID) error
	ListByDate(context.Context, time.Time) ([]domain.Lesson, error)
	ListBetween(context.Context, time.Time, time.Time) ([]domain.Lesson, error)
}

// These contracts keep future adapters independent from delivery and use cases.
type GuardianRepository interface {
	Create(context.Context, domain.Guardian) error
	ListByStudentID(context.Context, uuid.UUID) ([]domain.Guardian, error)
	ReplaceByStudentID(context.Context, uuid.UUID, []domain.Guardian) error
	DeleteByStudentID(context.Context, uuid.UUID) error
}

type BaseScheduleRepository interface {
	Create(context.Context, domain.BaseSchedule) error
	ListByStudentID(context.Context, uuid.UUID) ([]domain.BaseSchedule, error)
}

type TeacherContactRepository interface {
	Create(context.Context, domain.TeacherContact) error
	GetByID(context.Context, uuid.UUID) (domain.TeacherContact, error)
	List(context.Context) ([]domain.TeacherContact, error)
	Update(context.Context, domain.TeacherContact) error
	Delete(context.Context, uuid.UUID) error
}
