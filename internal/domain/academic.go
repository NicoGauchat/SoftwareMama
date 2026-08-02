package domain

import (
	"time"

	"github.com/google/uuid"
)

type SchoolGroup struct {
	ID       uuid.UUID
	SchoolID uuid.UUID
	Grade    int
}

type School struct {
	ID      uuid.UUID
	Name    string
	Address string
	Phone   string
	Notes   string
}

type Subject struct {
	ID            uuid.UUID
	SchoolGroupID uuid.UUID
	Name          string
}

type Assessment struct {
	ID        uuid.UUID
	SubjectID uuid.UUID
	Title     string
	Type      string
	Date      time.Time
	Notes     string
}

type StudentAssessment struct {
	ID          uuid.UUID
	StudentID   uuid.UUID
	SubjectName string
	Title       string
	Type        string
	Date        time.Time
	Score       *float64
	Notes       string
}
