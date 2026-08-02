package domain

import "github.com/google/uuid"

type Relationship string

const (
	RelationshipFather   Relationship = "father"
	RelationshipMother   Relationship = "mother"
	RelationshipRelative Relationship = "relative"
	RelationshipOther    Relationship = "other"
)

type Guardian struct {
	ID           uuid.UUID
	StudentID    uuid.UUID
	Name         string
	Relationship Relationship
	Phone        string
	Email        string
}
