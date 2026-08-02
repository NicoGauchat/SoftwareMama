package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"net/http"
	"softwaremama/internal/domain"
	"softwaremama/internal/repository"
	"strings"
)

type TeacherHandler struct {
	teachers repository.TeacherContactRepository
}

func NewTeacherHandler(teachers repository.TeacherContactRepository) *TeacherHandler {
	return &TeacherHandler{teachers}
}
func (h *TeacherHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/teachers", h.list)
	r.POST("/teachers", h.create)
	r.PATCH("/teachers/:id", h.update)
	r.DELETE("/teachers/:id", h.delete)
}

type teacherInput struct {
	Name        string `json:"name" binding:"required"`
	School      string `json:"school"`
	Subject     string `json:"subject"`
	PhoneNumber string `json:"phoneNumber"`
	Email       string `json:"email"`
}

func (h *TeacherHandler) list(c *gin.Context) {
	items, err := h.teachers.List(c)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}
func (h *TeacherHandler) create(c *gin.Context) {
	var in teacherInput
	if c.ShouldBindJSON(&in) != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "name is required"})
		return
	}
	t := domain.TeacherContact{ID: uuid.New(), Name: strings.TrimSpace(in.Name), School: strings.TrimSpace(in.School), Subject: strings.TrimSpace(in.Subject), PhoneNumber: strings.TrimSpace(in.PhoneNumber), Email: strings.TrimSpace(in.Email)}
	if t.Name == "" {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "name is required"})
		return
	}
	if err := h.teachers.Create(c, t); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, t)
}
func (h *TeacherHandler) update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid teacher id"})
		return
	}
	var in teacherInput
	if c.ShouldBindJSON(&in) != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid data"})
		return
	}
	t := domain.TeacherContact{ID: id, Name: strings.TrimSpace(in.Name), School: strings.TrimSpace(in.School), Subject: strings.TrimSpace(in.Subject), PhoneNumber: strings.TrimSpace(in.PhoneNumber), Email: strings.TrimSpace(in.Email)}
	if t.Name == "" {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "name is required"})
		return
	}
	if err = h.teachers.Update(c, t); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, t)
}
func (h *TeacherHandler) delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid teacher id"})
		return
	}
	if err = h.teachers.Delete(c, id); err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
