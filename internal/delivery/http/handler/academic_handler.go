package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"softwaremama/internal/domain"
	"softwaremama/internal/repository"
)

type AcademicHandler struct {
	academics repository.AcademicRepository
	students  repository.StudentRepository
}

func NewAcademicHandler(academics repository.AcademicRepository, students repository.StudentRepository) *AcademicHandler {
	return &AcademicHandler{academics: academics, students: students}
}

func (h *AcademicHandler) RegisterRoutes(router *gin.RouterGroup) {
	router.GET("/schools", h.listSchools)
	router.POST("/schools", h.createSchool)
	router.PATCH("/schools/:id", h.updateSchool)
	router.DELETE("/schools/:id", h.deleteSchool)
	router.POST("/schools/:id/grades", h.createSchoolGroup)
	router.DELETE("/school-grades/:id", h.deleteSchoolGroup)
	router.POST("/school-grades/:id/exams", h.createGradeAssessment)
	router.POST("/school-groups/:id/subjects", h.createSubject)
	router.DELETE("/subjects/:id", h.deleteSubject)
	router.POST("/subjects/:id/assessments", h.createAssessment)
	router.DELETE("/assessments/:id", h.deleteAssessment)
	router.GET("/students/:id/assessments", h.listStudentAssessments)
	router.POST("/students/:id/assessments", h.createStudentAssessment)
	router.DELETE("/student-assessments/:id", h.deleteStudentAssessment)
}

type assessmentResponse struct {
	ID    uuid.UUID `json:"id"`
	Title string    `json:"title"`
	Type  string    `json:"type"`
	Date  string    `json:"date"`
	Notes string    `json:"notes"`
}

type subjectResponse struct {
	ID          uuid.UUID            `json:"id"`
	Name        string               `json:"name"`
	Assessments []assessmentResponse `json:"assessments"`
}

type schoolGroupResponse struct {
	ID       uuid.UUID         `json:"id"`
	Grade    int               `json:"grade"`
	Subjects []subjectResponse `json:"subjects"`
}

type schoolResponse struct {
	ID      uuid.UUID             `json:"id"`
	Name    string                `json:"name"`
	Address string                `json:"address"`
	Phone   string                `json:"phone"`
	Notes   string                `json:"notes"`
	Grades  []schoolGroupResponse `json:"grades"`
}

func (h *AcademicHandler) listSchools(c *gin.Context) {
	schools, err := h.academics.ListSchools(c.Request.Context())
	if err != nil {
		writeError(c, err)
		return
	}
	groups, err := h.academics.ListSchoolGroups(c.Request.Context())
	if err != nil {
		writeError(c, err)
		return
	}
	response := make([]schoolResponse, 0, len(schools))
	for _, school := range schools {
		schoolItem := schoolResponse{
			ID: school.ID, Name: school.Name, Address: school.Address,
			Phone: school.Phone, Notes: school.Notes,
			Grades: make([]schoolGroupResponse, 0),
		}
		for _, group := range groups {
			if group.SchoolID != school.ID {
				continue
			}
			subjects, err := h.academics.ListSubjects(c.Request.Context(), group.ID)
			if err != nil {
				writeError(c, err)
				return
			}
			groupItem := schoolGroupResponse{
				ID: group.ID, Grade: group.Grade,
				Subjects: make([]subjectResponse, 0, len(subjects)),
			}
			for _, subject := range subjects {
				assessments, err := h.academics.ListAssessments(c.Request.Context(), subject.ID)
				if err != nil {
					writeError(c, err)
					return
				}
				subjectItem := subjectResponse{
					ID: subject.ID, Name: subject.Name,
					Assessments: make([]assessmentResponse, 0, len(assessments)),
				}
				for _, assessment := range assessments {
					subjectItem.Assessments = append(subjectItem.Assessments, assessmentResponse{
						ID: assessment.ID, Title: assessment.Title, Type: assessment.Type,
						Date: assessment.Date.Format("2006-01-02"), Notes: assessment.Notes,
					})
				}
				groupItem.Subjects = append(groupItem.Subjects, subjectItem)
			}
			schoolItem.Grades = append(schoolItem.Grades, groupItem)
		}
		response = append(response, schoolItem)
	}
	c.JSON(http.StatusOK, response)
}

func (h *AcademicHandler) createSchool(c *gin.Context) {
	h.saveSchool(c, uuid.New(), true)
}

func (h *AcademicHandler) updateSchool(c *gin.Context) {
	id, ok := parseAcademicID(c)
	if !ok {
		return
	}
	h.saveSchool(c, id, false)
}

func (h *AcademicHandler) saveSchool(c *gin.Context, id uuid.UUID, create bool) {
	var input struct {
		Name    string `json:"name" binding:"required"`
		Address string `json:"address"`
		Phone   string `json:"phone"`
		Notes   string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "school name is required"})
		return
	}
	item := domain.School{
		ID: id, Name: strings.TrimSpace(input.Name),
		Address: strings.TrimSpace(input.Address), Phone: strings.TrimSpace(input.Phone),
		Notes: strings.TrimSpace(input.Notes),
	}
	if item.Name == "" {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "school name is required"})
		return
	}
	var err error
	if create {
		err = h.academics.CreateSchool(c.Request.Context(), item)
	} else {
		err = h.academics.UpdateSchool(c.Request.Context(), item)
	}
	if err != nil {
		writeError(c, err)
		return
	}
	status := http.StatusOK
	if create {
		status = http.StatusCreated
	}
	c.JSON(status, schoolResponse{
		ID: item.ID, Name: item.Name, Address: item.Address, Phone: item.Phone,
		Notes: item.Notes, Grades: []schoolGroupResponse{},
	})
}

func (h *AcademicHandler) createSchoolGroup(c *gin.Context) {
	schoolID, ok := parseAcademicID(c)
	if !ok {
		return
	}
	var input struct {
		Grade int `json:"grade" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.Grade < 1 || input.Grade > 7 {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "grade from 1 to 7 is required"})
		return
	}
	item := domain.SchoolGroup{ID: uuid.New(), SchoolID: schoolID, Grade: input.Grade}
	if err := h.academics.CreateSchoolGroup(c.Request.Context(), item); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, schoolGroupResponse{ID: item.ID, Grade: item.Grade, Subjects: []subjectResponse{}})
}

func (h *AcademicHandler) createSubject(c *gin.Context) {
	groupID, ok := parseAcademicID(c)
	if !ok {
		return
	}
	var input struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Name) == "" {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "subject name is required"})
		return
	}
	item := domain.Subject{ID: uuid.New(), SchoolGroupID: groupID, Name: strings.TrimSpace(input.Name)}
	if err := h.academics.CreateSubject(c.Request.Context(), item); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, subjectResponse{ID: item.ID, Name: item.Name, Assessments: []assessmentResponse{}})
}

func (h *AcademicHandler) createAssessment(c *gin.Context) {
	subjectID, ok := parseAcademicID(c)
	if !ok {
		return
	}
	var input struct {
		Title string `json:"title" binding:"required"`
		Type  string `json:"type" binding:"required"`
		Date  string `json:"date" binding:"required"`
		Notes string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "title, type and date are required"})
		return
	}
	date, err := time.Parse("2006-01-02", input.Date)
	if err != nil || !validAssessmentType(input.Type) || strings.TrimSpace(input.Title) == "" {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid assessment data"})
		return
	}
	item := domain.Assessment{
		ID: uuid.New(), SubjectID: subjectID, Title: strings.TrimSpace(input.Title),
		Type: input.Type, Date: date, Notes: strings.TrimSpace(input.Notes),
	}
	if err := h.academics.CreateAssessment(c.Request.Context(), item); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, assessmentResponse{
		ID: item.ID, Title: item.Title, Type: item.Type,
		Date: item.Date.Format("2006-01-02"), Notes: item.Notes,
	})
}

func (h *AcademicHandler) createGradeAssessment(c *gin.Context) {
	groupID, ok := parseAcademicID(c)
	if !ok {
		return
	}
	var input struct {
		SubjectName string `json:"subjectName" binding:"required"`
		Title       string `json:"title"`
		Date        string `json:"date" binding:"required"`
		Notes       string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "subject and date are required"})
		return
	}
	subjectName := strings.TrimSpace(input.SubjectName)
	date, err := time.Parse("2006-01-02", input.Date)
	if err != nil || subjectName == "" {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "subject and a valid date are required"})
		return
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = "Examen"
	}
	item := domain.Assessment{
		ID: uuid.New(), Title: title, Type: "exam", Date: date,
		Notes: strings.TrimSpace(input.Notes),
	}
	if err := h.academics.CreateAssessmentForGrade(c.Request.Context(), groupID, subjectName, item); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, assessmentResponse{
		ID: item.ID, Title: item.Title, Type: item.Type,
		Date: item.Date.Format("2006-01-02"), Notes: item.Notes,
	})
}

type studentAssessmentResponse struct {
	ID          uuid.UUID `json:"id"`
	SubjectName string    `json:"subjectName"`
	Title       string    `json:"title"`
	Type        string    `json:"type"`
	Date        string    `json:"date"`
	Score       *float64  `json:"score"`
	Notes       string    `json:"notes"`
}

func (h *AcademicHandler) listStudentAssessments(c *gin.Context) {
	studentID, ok := parseAcademicID(c)
	if !ok {
		return
	}
	items, err := h.academics.ListStudentAssessments(c.Request.Context(), studentID)
	if err != nil {
		writeError(c, err)
		return
	}
	response := make([]studentAssessmentResponse, 0, len(items))
	for _, item := range items {
		response = append(response, toStudentAssessmentResponse(item))
	}
	c.JSON(http.StatusOK, response)
}

func (h *AcademicHandler) createStudentAssessment(c *gin.Context) {
	studentID, ok := parseAcademicID(c)
	if !ok {
		return
	}
	student, err := h.students.GetByID(c.Request.Context(), studentID)
	if err != nil {
		writeError(c, err)
		return
	}
	if !student.IsActive {
		c.JSON(http.StatusConflict, errorResponse{Error: "no se pueden agregar evaluaciones a un alumno inactivo"})
		return
	}
	var input struct {
		SubjectName string   `json:"subjectName" binding:"required"`
		Title       string   `json:"title" binding:"required"`
		Type        string   `json:"type" binding:"required"`
		Date        string   `json:"date" binding:"required"`
		Score       *float64 `json:"score"`
		Notes       string   `json:"notes"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "subject, title, type and date are required"})
		return
	}
	date, err := time.Parse("2006-01-02", input.Date)
	if err != nil || !validAssessmentType(input.Type) ||
		strings.TrimSpace(input.SubjectName) == "" || strings.TrimSpace(input.Title) == "" {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid assessment data"})
		return
	}
	if input.Score != nil && (*input.Score < 0 || *input.Score > 10) {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "score must be between 0 and 10"})
		return
	}
	item := domain.StudentAssessment{
		ID: uuid.New(), StudentID: studentID, SubjectName: strings.TrimSpace(input.SubjectName),
		Title: strings.TrimSpace(input.Title), Type: input.Type, Date: date,
		Score: input.Score, Notes: strings.TrimSpace(input.Notes),
	}
	if err := h.academics.CreateStudentAssessment(c.Request.Context(), item); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toStudentAssessmentResponse(item))
}

func toStudentAssessmentResponse(item domain.StudentAssessment) studentAssessmentResponse {
	return studentAssessmentResponse{
		ID: item.ID, SubjectName: item.SubjectName, Title: item.Title,
		Type: item.Type, Date: item.Date.Format("2006-01-02"),
		Score: item.Score, Notes: item.Notes,
	}
}

func (h *AcademicHandler) deleteSchoolGroup(c *gin.Context) {
	h.deleteByID(c, h.academics.DeleteSchoolGroup)
}

func (h *AcademicHandler) deleteSchool(c *gin.Context) {
	h.deleteByID(c, h.academics.DeleteSchool)
}

func (h *AcademicHandler) deleteSubject(c *gin.Context) {
	h.deleteByID(c, h.academics.DeleteSubject)
}

func (h *AcademicHandler) deleteAssessment(c *gin.Context) {
	h.deleteByID(c, h.academics.DeleteAssessment)
}

func (h *AcademicHandler) deleteStudentAssessment(c *gin.Context) {
	h.deleteByID(c, h.academics.DeleteStudentAssessment)
}

func (h *AcademicHandler) deleteByID(c *gin.Context, remove func(context.Context, uuid.UUID) error) {
	id, ok := parseAcademicID(c)
	if !ok {
		return
	}
	if err := remove(c.Request.Context(), id); err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func parseAcademicID(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid id"})
		return uuid.Nil, false
	}
	return id, true
}

func validAssessmentType(value string) bool {
	switch value {
	case "exam", "make_up", "practical", "oral", "other":
		return true
	default:
		return false
	}
}
