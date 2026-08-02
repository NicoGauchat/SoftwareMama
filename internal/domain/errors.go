package domain

import "errors"

var (
	ErrNotFound     = errors.New("resource not found")
	ErrInvalidState = errors.New("invalid resource state")
	ErrInvalidInput = errors.New("invalid input")
	ErrConflict     = errors.New("resource conflict")
)
