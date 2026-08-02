package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"

	"softwaremama/internal/domain"
)

type Repositories struct {
	Students  *StudentRepository
	Guardians *GuardianRepository
	Lessons   *LessonRepository
	Teachers  *TeacherContactRepository
	Academics *AcademicRepository
}

func NewRepositories(db *sql.DB) Repositories {
	return Repositories{
		Students:  &StudentRepository{db: db},
		Guardians: &GuardianRepository{db: db},
		Lessons:   &LessonRepository{db: db},
		Teachers:  &TeacherContactRepository{db: db},
		Academics: &AcademicRepository{db: db},
	}
}

// Open connects to a local SQLite database. The auth token is intentionally
// unused: remote Turso needs its remote-compatible driver, while this adapter
// uses the SQLite driver selected for reliable local development on Windows.
func Open(databaseURL, authToken string) (*sql.DB, error) {
	_ = authToken
	db, err := sql.Open("sqlite", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}
	// SQLite connection settings such as foreign_keys are connection-scoped.
	// A single connection also suits this small local desktop application.
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping sqlite database: %w", err)
	}
	return db, nil
}

func Migrate(ctx context.Context, db *sql.DB) error {
	statements := []string{
		`PRAGMA foreign_keys = ON`,
		`CREATE TABLE IF NOT EXISTS students (
			id TEXT PRIMARY KEY, name TEXT NOT NULL, school TEXT NOT NULL DEFAULT '',
			grade INTEGER NOT NULL DEFAULT 0, hourly_rate REAL NOT NULL, notes TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1, birth_date TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS guardians (
			id TEXT PRIMARY KEY, student_id TEXT NOT NULL, name TEXT NOT NULL, relationship TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
			FOREIGN KEY(student_id) REFERENCES students(id)
		)`,
		`CREATE TABLE IF NOT EXISTS teacher_contacts (
			id TEXT PRIMARY KEY, name TEXT NOT NULL, school TEXT NOT NULL DEFAULT '', phone_number TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS base_schedules (
			id TEXT PRIMARY KEY, student_id TEXT NOT NULL, day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
			start_time TEXT NOT NULL, duration_minutes INTEGER NOT NULL CHECK(duration_minutes > 0),
			FOREIGN KEY(student_id) REFERENCES students(id)
		)`,
		`CREATE TABLE IF NOT EXISTS lessons (
			id TEXT PRIMARY KEY, student_id TEXT NOT NULL, date TEXT NOT NULL, real_duration_minutes INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL CHECK(status IN ('scheduled','completed','cancelled')),
			attendance TEXT NOT NULL DEFAULT 'present' CHECK(attendance IN ('present','absent_excused','absent_unexcused')),
			payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('paid','pending')),
			amount REAL NOT NULL DEFAULT 0, hourly_rate REAL NOT NULL DEFAULT 0, paid_amount REAL NOT NULL DEFAULT 0, payment_method TEXT NOT NULL DEFAULT '', topic_notes TEXT NOT NULL DEFAULT '',
			FOREIGN KEY(student_id) REFERENCES students(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(date)`,
		`CREATE INDEX IF NOT EXISTS idx_lessons_student_id ON lessons(student_id)`,
		`CREATE TABLE IF NOT EXISTS schools (
			id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, address TEXT NOT NULL DEFAULT '',
			phone TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS school_groups (
			id TEXT PRIMARY KEY, school_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
			grade INTEGER NOT NULL CHECK(grade BETWEEN 1 AND 7),
			UNIQUE(name, grade),
			FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS subjects (
			id TEXT PRIMARY KEY, school_group_id TEXT NOT NULL, name TEXT NOT NULL,
			UNIQUE(school_group_id, name),
			FOREIGN KEY(school_group_id) REFERENCES school_groups(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS assessments (
			id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL,
			date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
			FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS student_assessments (
			id TEXT PRIMARY KEY, student_id TEXT NOT NULL, subject_name TEXT NOT NULL, title TEXT NOT NULL,
			type TEXT NOT NULL, date TEXT NOT NULL, score REAL, notes TEXT NOT NULL DEFAULT '',
			FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_assessments_date ON assessments(date)`,
		`CREATE INDEX IF NOT EXISTS idx_student_assessments_student ON student_assessments(student_id, date)`,
	}
	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("apply migration: %w", err)
		}
	}
	// Existing databases predate birth_date. SQLite has no ADD COLUMN IF NOT EXISTS.
	_, _ = db.ExecContext(ctx, `ALTER TABLE students ADD COLUMN birth_date TEXT NOT NULL DEFAULT ''`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE students ADD COLUMN phone TEXT NOT NULL DEFAULT ''`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE students ADD COLUMN email TEXT NOT NULL DEFAULT ''`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE students ADD COLUMN grade INTEGER NOT NULL DEFAULT 0`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE guardians ADD COLUMN email TEXT NOT NULL DEFAULT ''`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE teacher_contacts ADD COLUMN email TEXT NOT NULL DEFAULT ''`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE lessons ADD COLUMN hourly_rate REAL NOT NULL DEFAULT 0`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE lessons ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE lessons ADD COLUMN payment_method TEXT NOT NULL DEFAULT ''`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE school_groups ADD COLUMN school_id TEXT NOT NULL DEFAULT ''`)
	_, _ = db.ExecContext(ctx, `UPDATE lessons SET paid_amount=amount WHERE payment_status='paid' AND paid_amount=0`)
	if err := migrateLegacySchoolGroups(ctx, db); err != nil {
		return err
	}
	if err := ensureAllSchoolGrades(ctx, db); err != nil {
		return err
	}
	return nil
}

func migrateLegacySchoolGroups(ctx context.Context, db *sql.DB) error {
	rows, err := db.QueryContext(ctx, `SELECT DISTINCT name FROM school_groups WHERE school_id=''`)
	if err != nil {
		return fmt.Errorf("list legacy schools: %w", err)
	}
	names := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return err
		}
		names = append(names, name)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, name := range names {
		var schoolID string
		err := db.QueryRowContext(ctx, `SELECT id FROM schools WHERE name=?`, name).Scan(&schoolID)
		if errors.Is(err, sql.ErrNoRows) {
			schoolID = uuid.NewString()
			if _, err := db.ExecContext(ctx, `INSERT INTO schools (id,name) VALUES (?,?)`, schoolID, name); err != nil {
				return fmt.Errorf("create migrated school: %w", err)
			}
		} else if err != nil {
			return fmt.Errorf("find migrated school: %w", err)
		}
		if _, err := db.ExecContext(ctx, `UPDATE school_groups SET school_id=? WHERE name=? AND school_id=''`, schoolID, name); err != nil {
			return fmt.Errorf("link migrated school groups: %w", err)
		}
	}
	return nil
}

func ensureAllSchoolGrades(ctx context.Context, db *sql.DB) error {
	rows, err := db.QueryContext(ctx, `SELECT id,name FROM schools`)
	if err != nil {
		return fmt.Errorf("list schools for grade completion: %w", err)
	}
	type schoolIdentity struct{ id, name string }
	schools := make([]schoolIdentity, 0)
	for rows.Next() {
		var school schoolIdentity
		if err := rows.Scan(&school.id, &school.name); err != nil {
			rows.Close()
			return err
		}
		schools = append(schools, school)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, school := range schools {
		for grade := 1; grade <= 7; grade++ {
			_, err := db.ExecContext(ctx, `
				INSERT INTO school_groups (id,school_id,name,grade)
				SELECT ?,?,?,?
				WHERE NOT EXISTS (
					SELECT 1 FROM school_groups WHERE school_id=? AND grade=?
				)`,
				uuid.NewString(), school.id, school.name, grade, school.id, grade,
			)
			if err != nil {
				return fmt.Errorf("complete school grades: %w", err)
			}
		}
	}
	return nil
}

type StudentRepository struct{ db *sql.DB }

func (r *StudentRepository) Create(ctx context.Context, s domain.Student) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO students (id,name,school,grade,hourly_rate,notes,is_active,birth_date,phone,email) VALUES (?,?,?,?,?,?,?,?,?,?)`, s.ID.String(), s.Name, s.School, s.Grade, s.HourlyRate, s.Notes, s.IsActive, dateString(s.BirthDate), s.Phone, s.Email)
	return wrapWriteError(err)
}

func (r *StudentRepository) GetByID(ctx context.Context, id uuid.UUID) (domain.Student, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id,name,school,grade,hourly_rate,notes,is_active,birth_date,phone,email FROM students WHERE id = ?`, id.String())
	student, err := scanStudent(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Student{}, domain.ErrNotFound
	}
	return student, err
}

func (r *StudentRepository) List(ctx context.Context) ([]domain.Student, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,name,school,grade,hourly_rate,notes,is_active,birth_date,phone,email FROM students ORDER BY name ASC`)
	if err != nil {
		return nil, fmt.Errorf("list students: %w", err)
	}
	defer rows.Close()

	students := make([]domain.Student, 0)
	for rows.Next() {
		student, err := scanStudent(rows)
		if err != nil {
			return nil, err
		}
		students = append(students, student)
	}
	return students, rows.Err()
}

func (r *StudentRepository) Update(ctx context.Context, s domain.Student) error {
	result, err := r.db.ExecContext(ctx, `UPDATE students SET name=?,school=?,grade=?,hourly_rate=?,notes=?,is_active=?,birth_date=?,phone=?,email=? WHERE id=?`, s.Name, s.School, s.Grade, s.HourlyRate, s.Notes, s.IsActive, dateString(s.BirthDate), s.Phone, s.Email, s.ID.String())
	if err != nil {
		return wrapWriteError(err)
	}
	return ensureUpdated(result)
}

func (r *StudentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM students WHERE id=?`, id.String())
	if err != nil {
		return wrapWriteError(err)
	}
	return ensureUpdated(result)
}

type GuardianRepository struct{ db *sql.DB }

type TeacherContactRepository struct{ db *sql.DB }

func (r *TeacherContactRepository) Create(ctx context.Context, t domain.TeacherContact) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO teacher_contacts (id,name,school,phone_number,subject,email) VALUES (?,?,?,?,?,?)`, t.ID.String(), t.Name, t.School, t.PhoneNumber, t.Subject, t.Email)
	return wrapWriteError(err)
}

func (r *TeacherContactRepository) GetByID(ctx context.Context, id uuid.UUID) (domain.TeacherContact, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id,name,school,phone_number,subject,email FROM teacher_contacts WHERE id=?`, id.String())
	return scanTeacher(row)
}

func (r *TeacherContactRepository) List(ctx context.Context) ([]domain.TeacherContact, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,name,school,phone_number,subject,email FROM teacher_contacts ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.TeacherContact, 0)
	for rows.Next() {
		item, err := scanTeacher(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *TeacherContactRepository) Update(ctx context.Context, t domain.TeacherContact) error {
	result, err := r.db.ExecContext(ctx, `UPDATE teacher_contacts SET name=?,school=?,phone_number=?,subject=?,email=? WHERE id=?`, t.Name, t.School, t.PhoneNumber, t.Subject, t.Email, t.ID.String())
	if err != nil {
		return wrapWriteError(err)
	}
	return ensureUpdated(result)
}

func (r *TeacherContactRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM teacher_contacts WHERE id=?`, id.String())
	if err != nil {
		return wrapWriteError(err)
	}
	return ensureUpdated(result)
}

func (r *GuardianRepository) Create(ctx context.Context, guardian domain.Guardian) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO guardians (id,student_id,name,relationship,phone,email) VALUES (?,?,?,?,?,?)`, guardian.ID.String(), guardian.StudentID.String(), guardian.Name, guardian.Relationship, guardian.Phone, guardian.Email)
	return wrapWriteError(err)
}

func (r *GuardianRepository) ListByStudentID(ctx context.Context, studentID uuid.UUID) ([]domain.Guardian, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,student_id,name,relationship,phone,email FROM guardians WHERE student_id=? ORDER BY name ASC`, studentID.String())
	if err != nil {
		return nil, fmt.Errorf("list guardians: %w", err)
	}
	defer rows.Close()

	guardians := make([]domain.Guardian, 0)
	for rows.Next() {
		var guardian domain.Guardian
		var id, studentIDText string
		if err := rows.Scan(&id, &studentIDText, &guardian.Name, &guardian.Relationship, &guardian.Phone, &guardian.Email); err != nil {
			return nil, err
		}
		var err error
		if guardian.ID, err = uuid.Parse(id); err != nil {
			return nil, fmt.Errorf("parse guardian id: %w", err)
		}
		if guardian.StudentID, err = uuid.Parse(studentIDText); err != nil {
			return nil, fmt.Errorf("parse guardian student id: %w", err)
		}
		guardians = append(guardians, guardian)
	}
	return guardians, rows.Err()
}

func (r *GuardianRepository) DeleteByStudentID(ctx context.Context, studentID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM guardians WHERE student_id=?`, studentID.String())
	return wrapWriteError(err)
}

func (r *GuardianRepository) ReplaceByStudentID(ctx context.Context, studentID uuid.UUID, guardians []domain.Guardian) error {
	transaction, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin guardian replacement: %w", err)
	}
	defer transaction.Rollback()
	if _, err := transaction.ExecContext(ctx, `DELETE FROM guardians WHERE student_id=?`, studentID.String()); err != nil {
		return wrapWriteError(err)
	}
	for _, guardian := range guardians {
		if _, err := transaction.ExecContext(ctx, `INSERT INTO guardians (id,student_id,name,relationship,phone,email) VALUES (?,?,?,?,?,?)`, guardian.ID.String(), studentID.String(), guardian.Name, guardian.Relationship, guardian.Phone, guardian.Email); err != nil {
			return wrapWriteError(err)
		}
	}
	if err := transaction.Commit(); err != nil {
		return fmt.Errorf("commit guardian replacement: %w", err)
	}
	return nil
}

type LessonRepository struct{ db *sql.DB }

func (r *LessonRepository) Create(ctx context.Context, l domain.Lesson) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO lessons (id,student_id,date,real_duration_minutes,status,attendance,payment_status,amount,hourly_rate,paid_amount,payment_method,topic_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, l.ID.String(), l.StudentID.String(), l.Date.UTC().Format(time.RFC3339Nano), l.RealDurationMinutes, l.Status, l.Attendance, l.PaymentStatus, l.Amount, l.HourlyRate, l.PaidAmount, l.PaymentMethod, l.TopicNotes)
	return wrapWriteError(err)
}

func (r *LessonRepository) GetByID(ctx context.Context, id uuid.UUID) (domain.Lesson, error) {
	row := r.db.QueryRowContext(ctx, lessonSelect+` WHERE id=?`, id.String())
	lesson, err := scanLesson(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Lesson{}, domain.ErrNotFound
	}
	return lesson, err
}

func (r *LessonRepository) Update(ctx context.Context, l domain.Lesson) error {
	result, err := r.db.ExecContext(ctx, `UPDATE lessons SET student_id=?,date=?,real_duration_minutes=?,status=?,attendance=?,payment_status=?,amount=?,hourly_rate=?,paid_amount=?,payment_method=?,topic_notes=? WHERE id=?`, l.StudentID.String(), l.Date.UTC().Format(time.RFC3339Nano), l.RealDurationMinutes, l.Status, l.Attendance, l.PaymentStatus, l.Amount, l.HourlyRate, l.PaidAmount, l.PaymentMethod, l.TopicNotes, l.ID.String())
	if err != nil {
		return wrapWriteError(err)
	}
	return ensureUpdated(result)
}

func (r *LessonRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM lessons WHERE id=?`, id.String())
	if err != nil {
		return wrapWriteError(err)
	}
	return ensureUpdated(result)
}

func (r *LessonRepository) ListByDate(ctx context.Context, date time.Time) ([]domain.Lesson, error) {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 0, 1)
	rows, err := r.db.QueryContext(ctx, lessonSelect+` WHERE date >= ? AND date < ? ORDER BY date ASC`, start.Format(time.RFC3339Nano), end.Format(time.RFC3339Nano))
	if err != nil {
		return nil, fmt.Errorf("list lessons: %w", err)
	}
	defer rows.Close()
	lessons := make([]domain.Lesson, 0)
	for rows.Next() {
		lesson, err := scanLesson(rows)
		if err != nil {
			return nil, err
		}
		lessons = append(lessons, lesson)
	}
	return lessons, rows.Err()
}

func (r *LessonRepository) ListBetween(ctx context.Context, from, to time.Time) ([]domain.Lesson, error) {
	start := time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, time.UTC)
	end := time.Date(to.Year(), to.Month(), to.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, 1)
	rows, err := r.db.QueryContext(
		ctx,
		lessonSelect+` WHERE date >= ? AND date < ? ORDER BY date ASC`,
		start.Format(time.RFC3339Nano),
		end.Format(time.RFC3339Nano),
	)
	if err != nil {
		return nil, fmt.Errorf("list lessons between dates: %w", err)
	}
	defer rows.Close()
	lessons := make([]domain.Lesson, 0)
	for rows.Next() {
		lesson, err := scanLesson(rows)
		if err != nil {
			return nil, err
		}
		lessons = append(lessons, lesson)
	}
	return lessons, rows.Err()
}

const lessonSelect = `SELECT id,student_id,date,real_duration_minutes,status,attendance,payment_status,amount,hourly_rate,paid_amount,payment_method,topic_notes FROM lessons`

type AcademicRepository struct{ db *sql.DB }

func (r *AcademicRepository) ListSchools(ctx context.Context) ([]domain.School, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,name,address,phone,notes FROM schools ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list schools: %w", err)
	}
	defer rows.Close()
	items := make([]domain.School, 0)
	for rows.Next() {
		var item domain.School
		var id string
		if err := rows.Scan(&id, &item.Name, &item.Address, &item.Phone, &item.Notes); err != nil {
			return nil, err
		}
		if item.ID, err = uuid.Parse(id); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *AcademicRepository) CreateSchool(ctx context.Context, item domain.School) error {
	transaction, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin school creation: %w", err)
	}
	defer transaction.Rollback()
	if _, err := transaction.ExecContext(ctx, `INSERT INTO schools (id,name,address,phone,notes) VALUES (?,?,?,?,?)`, item.ID.String(), item.Name, item.Address, item.Phone, item.Notes); err != nil {
		return wrapWriteError(err)
	}
	for grade := 1; grade <= 7; grade++ {
		if _, err := transaction.ExecContext(ctx, `INSERT INTO school_groups (id,school_id,name,grade) VALUES (?,?,?,?)`, uuid.NewString(), item.ID.String(), item.Name, grade); err != nil {
			return wrapWriteError(err)
		}
	}
	return transaction.Commit()
}

func (r *AcademicRepository) UpdateSchool(ctx context.Context, item domain.School) error {
	transaction, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin school update: %w", err)
	}
	defer transaction.Rollback()
	var previousName string
	if err := transaction.QueryRowContext(ctx, `SELECT name FROM schools WHERE id=?`, item.ID.String()).Scan(&previousName); errors.Is(err, sql.ErrNoRows) {
		return domain.ErrNotFound
	} else if err != nil {
		return err
	}
	result, err := transaction.ExecContext(ctx, `UPDATE schools SET name=?,address=?,phone=?,notes=? WHERE id=?`, item.Name, item.Address, item.Phone, item.Notes, item.ID.String())
	if err != nil {
		return wrapWriteError(err)
	}
	if err := ensureUpdated(result); err != nil {
		return err
	}
	if _, err := transaction.ExecContext(ctx, `UPDATE school_groups SET name=? WHERE school_id=?`, item.Name, item.ID.String()); err != nil {
		return wrapWriteError(err)
	}
	if _, err := transaction.ExecContext(ctx, `UPDATE students SET school=? WHERE school=?`, item.Name, previousName); err != nil {
		return wrapWriteError(err)
	}
	return transaction.Commit()
}

func (r *AcademicRepository) DeleteSchool(ctx context.Context, id uuid.UUID) error {
	transaction, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin school deletion: %w", err)
	}
	defer transaction.Rollback()
	var schoolName string
	if err := transaction.QueryRowContext(ctx, `SELECT name FROM schools WHERE id=?`, id.String()).Scan(&schoolName); errors.Is(err, sql.ErrNoRows) {
		return domain.ErrNotFound
	} else if err != nil {
		return err
	}
	if _, err := transaction.ExecContext(ctx, `DELETE FROM school_groups WHERE school_id=?`, id.String()); err != nil {
		return wrapWriteError(err)
	}
	result, err := transaction.ExecContext(ctx, `DELETE FROM schools WHERE id=?`, id.String())
	if err != nil {
		return wrapWriteError(err)
	}
	if err := ensureUpdated(result); err != nil {
		return err
	}
	if _, err := transaction.ExecContext(ctx, `UPDATE students SET school='',grade=0 WHERE school=?`, schoolName); err != nil {
		return wrapWriteError(err)
	}
	return transaction.Commit()
}

func (r *AcademicRepository) ListSchoolGroups(ctx context.Context) ([]domain.SchoolGroup, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,school_id,grade FROM school_groups ORDER BY grade`)
	if err != nil {
		return nil, fmt.Errorf("list school groups: %w", err)
	}
	defer rows.Close()
	items := make([]domain.SchoolGroup, 0)
	for rows.Next() {
		var item domain.SchoolGroup
		var id, schoolID string
		if err := rows.Scan(&id, &schoolID, &item.Grade); err != nil {
			return nil, err
		}
		item.ID, err = uuid.Parse(id)
		if err != nil {
			return nil, err
		}
		item.SchoolID, err = uuid.Parse(schoolID)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *AcademicRepository) CreateSchoolGroup(ctx context.Context, item domain.SchoolGroup) error {
	result, err := r.db.ExecContext(ctx, `INSERT INTO school_groups (id,school_id,name,grade) SELECT ?,id,name,? FROM schools WHERE id=?`, item.ID.String(), item.Grade, item.SchoolID.String())
	if err != nil {
		return wrapWriteError(err)
	}
	return ensureUpdated(result)
}

func (r *AcademicRepository) DeleteSchoolGroup(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM school_groups WHERE id=?`, id.String())
	if err != nil {
		return wrapWriteError(err)
	}
	return ensureUpdated(result)
}

func (r *AcademicRepository) ListSubjects(ctx context.Context, groupID uuid.UUID) ([]domain.Subject, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,school_group_id,name FROM subjects WHERE school_group_id=? ORDER BY name`, groupID.String())
	if err != nil {
		return nil, fmt.Errorf("list subjects: %w", err)
	}
	defer rows.Close()
	items := make([]domain.Subject, 0)
	for rows.Next() {
		var item domain.Subject
		var id, parentID string
		if err := rows.Scan(&id, &parentID, &item.Name); err != nil {
			return nil, err
		}
		if item.ID, err = uuid.Parse(id); err != nil {
			return nil, err
		}
		if item.SchoolGroupID, err = uuid.Parse(parentID); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *AcademicRepository) CreateSubject(ctx context.Context, item domain.Subject) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO subjects (id,school_group_id,name) VALUES (?,?,?)`, item.ID.String(), item.SchoolGroupID.String(), item.Name)
	return wrapWriteError(err)
}

func (r *AcademicRepository) DeleteSubject(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM subjects WHERE id=?`, id.String())
	if err != nil {
		return wrapWriteError(err)
	}
	return ensureUpdated(result)
}

func (r *AcademicRepository) ListAssessments(ctx context.Context, subjectID uuid.UUID) ([]domain.Assessment, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,subject_id,title,type,date,notes FROM assessments WHERE subject_id=? ORDER BY date DESC`, subjectID.String())
	if err != nil {
		return nil, fmt.Errorf("list assessments: %w", err)
	}
	defer rows.Close()
	items := make([]domain.Assessment, 0)
	for rows.Next() {
		var item domain.Assessment
		var id, parentID, date string
		if err := rows.Scan(&id, &parentID, &item.Title, &item.Type, &date, &item.Notes); err != nil {
			return nil, err
		}
		if item.ID, err = uuid.Parse(id); err != nil {
			return nil, err
		}
		if item.SubjectID, err = uuid.Parse(parentID); err != nil {
			return nil, err
		}
		if item.Date, err = time.Parse("2006-01-02", date); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *AcademicRepository) CreateAssessment(ctx context.Context, item domain.Assessment) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO assessments (id,subject_id,title,type,date,notes) VALUES (?,?,?,?,?,?)`, item.ID.String(), item.SubjectID.String(), item.Title, item.Type, dateString(item.Date), item.Notes)
	return wrapWriteError(err)
}

func (r *AcademicRepository) CreateAssessmentForGrade(ctx context.Context, groupID uuid.UUID, subjectName string, item domain.Assessment) error {
	transaction, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin grade assessment creation: %w", err)
	}
	defer transaction.Rollback()
	var subjectID string
	err = transaction.QueryRowContext(ctx, `SELECT id FROM subjects WHERE school_group_id=? AND name=? COLLATE NOCASE`, groupID.String(), subjectName).Scan(&subjectID)
	if errors.Is(err, sql.ErrNoRows) {
		subjectID = uuid.NewString()
		if _, err := transaction.ExecContext(ctx, `INSERT INTO subjects (id,school_group_id,name) VALUES (?,?,?)`, subjectID, groupID.String(), subjectName); err != nil {
			return wrapWriteError(err)
		}
	} else if err != nil {
		return err
	}
	if _, err := transaction.ExecContext(ctx, `INSERT INTO assessments (id,subject_id,title,type,date,notes) VALUES (?,?,?,?,?,?)`, item.ID.String(), subjectID, item.Title, item.Type, dateString(item.Date), item.Notes); err != nil {
		return wrapWriteError(err)
	}
	return transaction.Commit()
}

func (r *AcademicRepository) DeleteAssessment(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM assessments WHERE id=?`, id.String())
	if err != nil {
		return wrapWriteError(err)
	}
	return ensureUpdated(result)
}

func (r *AcademicRepository) ListStudentAssessments(ctx context.Context, studentID uuid.UUID) ([]domain.StudentAssessment, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,student_id,subject_name,title,type,date,score,notes FROM student_assessments WHERE student_id=? ORDER BY date DESC`, studentID.String())
	if err != nil {
		return nil, fmt.Errorf("list student assessments: %w", err)
	}
	defer rows.Close()
	items := make([]domain.StudentAssessment, 0)
	for rows.Next() {
		var item domain.StudentAssessment
		var id, parentID, date string
		var score sql.NullFloat64
		if err := rows.Scan(&id, &parentID, &item.SubjectName, &item.Title, &item.Type, &date, &score, &item.Notes); err != nil {
			return nil, err
		}
		if item.ID, err = uuid.Parse(id); err != nil {
			return nil, err
		}
		if item.StudentID, err = uuid.Parse(parentID); err != nil {
			return nil, err
		}
		if item.Date, err = time.Parse("2006-01-02", date); err != nil {
			return nil, err
		}
		if score.Valid {
			item.Score = &score.Float64
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *AcademicRepository) CreateStudentAssessment(ctx context.Context, item domain.StudentAssessment) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO student_assessments (id,student_id,subject_name,title,type,date,score,notes) VALUES (?,?,?,?,?,?,?,?)`, item.ID.String(), item.StudentID.String(), item.SubjectName, item.Title, item.Type, dateString(item.Date), item.Score, item.Notes)
	return wrapWriteError(err)
}

func (r *AcademicRepository) DeleteStudentAssessment(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM student_assessments WHERE id=?`, id.String())
	if err != nil {
		return wrapWriteError(err)
	}
	return ensureUpdated(result)
}

type scanner interface{ Scan(...any) error }

func scanStudent(s scanner) (domain.Student, error) {
	var student domain.Student
	var id string
	var birthDate string
	if err := s.Scan(&id, &student.Name, &student.School, &student.Grade, &student.HourlyRate, &student.Notes, &student.IsActive, &birthDate, &student.Phone, &student.Email); err != nil {
		return domain.Student{}, err
	}
	parsedID, err := uuid.Parse(id)
	if err != nil {
		return domain.Student{}, fmt.Errorf("parse student id: %w", err)
	}
	student.ID = parsedID
	if birthDate != "" {
		student.BirthDate, err = time.Parse("2006-01-02", birthDate)
		if err != nil {
			return domain.Student{}, fmt.Errorf("parse birth date: %w", err)
		}
	}
	return student, nil
}

func dateString(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format("2006-01-02")
}

func scanTeacher(s scanner) (domain.TeacherContact, error) {
	var teacher domain.TeacherContact
	var id string
	if err := s.Scan(&id, &teacher.Name, &teacher.School, &teacher.PhoneNumber, &teacher.Subject, &teacher.Email); err != nil {
		return domain.TeacherContact{}, err
	}
	parsed, err := uuid.Parse(id)
	if err != nil {
		return domain.TeacherContact{}, err
	}
	teacher.ID = parsed
	return teacher, nil
}

func scanLesson(s scanner) (domain.Lesson, error) {
	var lesson domain.Lesson
	var id, studentID, date string
	if err := s.Scan(&id, &studentID, &date, &lesson.RealDurationMinutes, &lesson.Status, &lesson.Attendance, &lesson.PaymentStatus, &lesson.Amount, &lesson.HourlyRate, &lesson.PaidAmount, &lesson.PaymentMethod, &lesson.TopicNotes); err != nil {
		return domain.Lesson{}, err
	}
	var err error
	if lesson.ID, err = uuid.Parse(id); err != nil {
		return domain.Lesson{}, fmt.Errorf("parse lesson id: %w", err)
	}
	if lesson.StudentID, err = uuid.Parse(studentID); err != nil {
		return domain.Lesson{}, fmt.Errorf("parse lesson student id: %w", err)
	}
	if lesson.Date, err = time.Parse(time.RFC3339Nano, date); err != nil {
		return domain.Lesson{}, fmt.Errorf("parse lesson date: %w", err)
	}
	return lesson, nil
}

func ensureUpdated(result sql.Result) error {
	n, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("check affected rows: %w", err)
	}
	if n == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func wrapWriteError(err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("write database: %w", err)
}
