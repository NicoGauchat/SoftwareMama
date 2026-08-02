package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"softwaremama/internal/domain"
	"softwaremama/internal/repository"
)

type StudentHandler struct {
	students  repository.StudentRepository
	guardians repository.GuardianRepository
}

func NewStudentHandler(students repository.StudentRepository, guardians repository.GuardianRepository) *StudentHandler {
	return &StudentHandler{students: students, guardians: guardians}
}

func (h *StudentHandler) RegisterRoutes(router *gin.RouterGroup) {
	router.GET("/students", h.listStudents)
	router.POST("/students", h.createStudent)
	router.PATCH("/students/:id", h.updateStudent)
	router.PATCH("/students/:id/inactive", h.deactivateStudent)
	router.PATCH("/students/:id/active", h.activateStudent)
	router.DELETE("/students/:id", h.deleteStudent)
}

type studentInput struct {
	Name       string  `json:"name" binding:"required"`
	School     string  `json:"school"`
	Grade      int     `json:"grade"`
	HourlyRate float64 `json:"hourlyRate"`
	BirthDate  string  `json:"birthDate" binding:"required"`
	Phone      string  `json:"phone"`
	Email      string  `json:"email"`
	Notes      string  `json:"notes"`
}

type guardianInput struct {
	Name         string `json:"name"`
	Relationship string `json:"relationship"`
	Phone        string `json:"phone"`
	Email        string `json:"email"`
}

type createStudentRequest struct {
	Student   studentInput    `json:"student" binding:"required"`
	Guardians []guardianInput `json:"guardians"`
	Guardian  *guardianInput  `json:"guardian"`
}

type updateStudentRequest struct {
	Student   studentInput    `json:"student" binding:"required"`
	Guardians []guardianInput `json:"guardians"`
}

type guardianResponse struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	Relationship string    `json:"relationship"`
	Phone        string    `json:"phone"`
	Email        string    `json:"email"`
}

type studentResponse struct {
	ID         uuid.UUID          `json:"id"`
	Name       string             `json:"name"`
	School     string             `json:"school"`
	Grade      int                `json:"grade"`
	HourlyRate float64            `json:"hourlyRate"`
	Notes      string             `json:"notes"`
	IsActive   bool               `json:"isActive"`
	BirthDate  string             `json:"birthDate"`
	Phone      string             `json:"phone"`
	Email      string             `json:"email"`
	Guardian   *guardianResponse  `json:"guardian,omitempty"`
	Guardians  []guardianResponse `json:"guardians"`
}

func (h *StudentHandler) createStudent(c *gin.Context) {
	var request createStudentRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	birthDate, err := time.Parse("2006-01-02", request.Student.BirthDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "birthDate must use YYYY-MM-DD"})
		return
	}
	rate := request.Student.HourlyRate
	if rate <= 0 {
		rate = 1
	}
	student := domain.Student{
		ID:         uuid.New(),
		Name:       strings.TrimSpace(request.Student.Name),
		School:     strings.TrimSpace(request.Student.School),
		Grade:      request.Student.Grade,
		HourlyRate: rate,
		Notes:      strings.TrimSpace(request.Student.Notes),
		IsActive:   true,
		BirthDate:  birthDate,
		Phone:      strings.TrimSpace(request.Student.Phone),
		Email:      strings.TrimSpace(request.Student.Email),
	}
	inputs := request.Guardians
	if len(inputs) == 0 && request.Guardian != nil {
		inputs = []guardianInput{*request.Guardian}
	}
	guardians, ok := buildGuardians(inputs, student.ID)
	if student.Name == "" || student.Grade < 0 || student.Grade > 7 || !ok {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "student name and at least one complete guardian are required"})
		return
	}
	if err := h.students.Create(c.Request.Context(), student); err != nil {
		writeError(c, err)
		return
	}
	if err := h.guardians.ReplaceByStudentID(c.Request.Context(), student.ID, guardians); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toStudentResponse(student, guardians))
}

func (h *StudentHandler) listStudents(c *gin.Context) {
	students, err := h.students.List(c.Request.Context())
	if err != nil {
		writeError(c, err)
		return
	}
	response := make([]studentResponse, 0, len(students))
	for _, student := range students {
		guardians, err := h.guardians.ListByStudentID(c.Request.Context(), student.ID)
		if err != nil {
			writeError(c, err)
			return
		}
		response = append(response, toStudentResponse(student, guardians))
	}
	c.JSON(http.StatusOK, response)
}

func (h *StudentHandler) updateStudent(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid student id"})
		return
	}
	var request updateStudentRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	birthDate, err := time.Parse("2006-01-02", request.Student.BirthDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "birthDate must use YYYY-MM-DD"})
		return
	}
	student, err := h.students.GetByID(c.Request.Context(), id)
	if err != nil {
		writeError(c, err)
		return
	}
	student.Name = strings.TrimSpace(request.Student.Name)
	student.School = strings.TrimSpace(request.Student.School)
	student.Grade = request.Student.Grade
	student.BirthDate = birthDate
	student.Phone = strings.TrimSpace(request.Student.Phone)
	student.Email = strings.TrimSpace(request.Student.Email)
	student.Notes = strings.TrimSpace(request.Student.Notes)
	if student.Name == "" || student.Grade < 0 || student.Grade > 7 {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "student name is required"})
		return
	}
	guardians, ok := buildGuardians(request.Guardians, student.ID)
	if len(request.Guardians) > 0 && !ok {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "guardian name, relationship and phone are required"})
		return
	}
	if err := h.students.Update(c.Request.Context(), student); err != nil {
		writeError(c, err)
		return
	}
	if len(request.Guardians) > 0 {
		if err := h.guardians.ReplaceByStudentID(c.Request.Context(), student.ID, guardians); err != nil {
			writeError(c, err)
			return
		}
	} else {
		guardians, err = h.guardians.ListByStudentID(c.Request.Context(), student.ID)
		if err != nil {
			writeError(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, toStudentResponse(student, guardians))
}

func (h *StudentHandler) deactivateStudent(c *gin.Context) {
	h.setStudentActive(c, false)
}

func (h *StudentHandler) activateStudent(c *gin.Context) {
	h.setStudentActive(c, true)
}

func (h *StudentHandler) setStudentActive(c *gin.Context, active bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid student id"})
		return
	}
	student, err := h.students.GetByID(c.Request.Context(), id)
	if err != nil {
		writeError(c, err)
		return
	}
	student.IsActive = active
	if err := h.students.Update(c.Request.Context(), student); err != nil {
		writeError(c, err)
		return
	}
	guardians, err := h.guardians.ListByStudentID(c.Request.Context(), student.ID)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toStudentResponse(student, guardians))
}

func (h *StudentHandler) deleteStudent(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid student id"})
		return
	}
	if err := h.guardians.DeleteByStudentID(c.Request.Context(), id); err != nil {
		writeError(c, err)
		return
	}
	if err := h.students.Delete(c.Request.Context(), id); err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func buildGuardians(inputs []guardianInput, studentID uuid.UUID) ([]domain.Guardian, bool) {
	if len(inputs) == 0 {
		return nil, false
	}
	guardians := make([]domain.Guardian, 0, len(inputs))
	for _, input := range inputs {
		name := strings.TrimSpace(input.Name)
		relationship := strings.TrimSpace(input.Relationship)
		phone := strings.TrimSpace(input.Phone)
		if name == "" || relationship == "" || phone == "" {
			return nil, false
		}
		guardians = append(guardians, domain.Guardian{
			ID:           uuid.New(),
			StudentID:    studentID,
			Name:         name,
			Relationship: domain.Relationship(relationship),
			Phone:        phone,
			Email:        strings.TrimSpace(input.Email),
		})
	}
	return guardians, true
}

func toStudentResponse(student domain.Student, guardians []domain.Guardian) studentResponse {
	response := studentResponse{
		ID:         student.ID,
		Name:       student.Name,
		School:     student.School,
		Grade:      student.Grade,
		HourlyRate: student.HourlyRate,
		Notes:      student.Notes,
		IsActive:   student.IsActive,
		BirthDate:  student.BirthDate.Format("2006-01-02"),
		Phone:      student.Phone,
		Email:      student.Email,
		Guardians:  make([]guardianResponse, 0, len(guardians)),
	}
	for _, guardian := range guardians {
		item := guardianResponse{
			ID:           guardian.ID,
			Name:         guardian.Name,
			Relationship: string(guardian.Relationship),
			Phone:        guardian.Phone,
			Email:        guardian.Email,
		}
		response.Guardians = append(response.Guardians, item)
	}
	if len(response.Guardians) > 0 {
		first := response.Guardians[0]
		response.Guardian = &first
	}
	return response
}
