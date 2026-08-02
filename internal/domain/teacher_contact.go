package domain

import "github.com/google/uuid"

type TeacherContact struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	School      string    `json:"school"`
	PhoneNumber string    `json:"phoneNumber"`
	Subject     string    `json:"subject"`
	Email       string    `json:"email"`
}
