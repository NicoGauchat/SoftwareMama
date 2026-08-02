package domain

import (
	"github.com/google/uuid"
	"time"
)

type Student struct {
	ID         uuid.UUID
	Name       string
	School     string
	Grade      int
	HourlyRate float64
	Notes      string
	IsActive   bool
	BirthDate  time.Time
	Phone      string
	Email      string
}
