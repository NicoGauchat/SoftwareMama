package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"softwaremama/internal/domain"
	"softwaremama/internal/repository"
	"softwaremama/internal/usecase"
)

type LessonHandler struct {
	complete   usecase.CompleteLessonUseCase
	daily      usecase.GetDailyLessonsUseCase
	reschedule usecase.RescheduleLessonUseCase
	cancel     usecase.CancelLessonUseCase
	lessons    repository.LessonRepository
}

func NewLessonHandler(complete usecase.CompleteLessonUseCase, daily usecase.GetDailyLessonsUseCase, reschedule usecase.RescheduleLessonUseCase, cancel usecase.CancelLessonUseCase, lessons repository.LessonRepository) *LessonHandler {
	return &LessonHandler{complete: complete, daily: daily, reschedule: reschedule, cancel: cancel, lessons: lessons}
}

func (h *LessonHandler) RegisterRoutes(router *gin.RouterGroup) {
	router.GET("/lessons", h.getDailyLessons)
	router.GET("/lessons/range", h.getLessonsRange)
	router.POST("/lessons", h.createLesson)
	router.PATCH("/lessons/:id/complete", h.completeLesson)
	router.PATCH("/lessons/:id/reschedule", h.rescheduleLesson)
	router.PATCH("/lessons/:id/cancel", h.cancelLesson)
	router.PATCH("/lessons/:id/reopen", h.reopenLesson)
	router.PATCH("/lessons/:id/payment", h.registerLessonPayment)
	router.PATCH("/lessons/:id/payment/reset", h.resetLessonPayment)
	router.POST("/payments", h.registerBatchPayment)
}

func (h *LessonHandler) getLessonsRange(c *gin.Context) {
	from, fromErr := time.Parse("2006-01-02", c.Query("from"))
	to, toErr := time.Parse("2006-01-02", c.Query("to"))
	if fromErr != nil || toErr != nil || to.Before(from) || to.Sub(from) > 370*24*time.Hour {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "from and to must be valid dates covering at most 12 months"})
		return
	}
	lessons, err := h.lessons.ListBetween(c.Request.Context(), from, to)
	if err != nil {
		writeError(c, err)
		return
	}
	response := make([]lessonResponse, 0, len(lessons))
	for _, lesson := range lessons {
		response = append(response, toLessonResponse(lesson))
	}
	c.JSON(http.StatusOK, response)
}

type createLessonRequest struct {
	StudentID       uuid.UUID `json:"studentId" binding:"required"`
	Date            time.Time `json:"date" binding:"required"`
	DurationMinutes int       `json:"durationMinutes"`
	HourlyRate      float64   `json:"hourlyRate"`
}

func (h *LessonHandler) createLesson(c *gin.Context) {
	var request createLessonRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	duration := request.DurationMinutes
	if duration <= 0 {
		duration = 60
	}
	existing, err := h.lessons.ListByDate(c.Request.Context(), request.Date)
	if err != nil {
		writeError(c, err)
		return
	}
	for _, item := range existing {
		if item.StudentID == request.StudentID && item.Date.Equal(request.Date) && item.Status != domain.LessonStatusCancelled {
			c.JSON(http.StatusConflict, errorResponse{Error: "student already has a lesson at this time"})
			return
		}
	}
	lesson := domain.Lesson{ID: uuid.New(), StudentID: request.StudentID, Date: request.Date, RealDurationMinutes: duration, HourlyRate: request.HourlyRate, Status: domain.LessonStatusScheduled, Attendance: domain.AttendancePresent, PaymentStatus: domain.PaymentStatusPending}
	if err := h.lessons.Create(c.Request.Context(), lesson); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toLessonResponse(lesson))
}

type completeLessonRequest struct {
	RealDurationMinutes int    `json:"realDurationMinutes" binding:"required,gt=0"`
	Attendance          string `json:"attendance" binding:"required"`
	PaymentStatus       string `json:"paymentStatus" binding:"required"`
	PaymentMethod       string `json:"paymentMethod"`
	TopicNotes          string `json:"topicNotes"`
}
type rescheduleLessonRequest struct {
	Date time.Time `json:"date" binding:"required"`
}
type lessonResponse struct {
	ID                  uuid.UUID `json:"id"`
	StudentID           uuid.UUID `json:"studentId"`
	Date                time.Time `json:"date"`
	RealDurationMinutes int       `json:"realDurationMinutes"`
	Status              string    `json:"status"`
	Attendance          string    `json:"attendance"`
	PaymentStatus       string    `json:"paymentStatus"`
	Amount              float64   `json:"amount"`
	HourlyRate          float64   `json:"hourlyRate"`
	PaidAmount          float64   `json:"paidAmount"`
	PaymentMethod       string    `json:"paymentMethod"`
	TopicNotes          string    `json:"topicNotes"`
}
type errorResponse struct {
	Error string `json:"error"`
}

func (h *LessonHandler) completeLesson(c *gin.Context) {
	id, ok := lessonID(c)
	if !ok {
		return
	}
	var request completeLessonRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	lesson, err := h.complete.Execute(c.Request.Context(), usecase.CompleteLessonInput{LessonID: id, RealDurationMinutes: request.RealDurationMinutes, Attendance: domain.Attendance(request.Attendance), PaymentStatus: domain.PaymentStatus(request.PaymentStatus), PaymentMethod: domain.PaymentMethod(request.PaymentMethod), TopicNotes: request.TopicNotes})
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toLessonResponse(lesson))
}

func (h *LessonHandler) getDailyLessons(c *gin.Context) {
	date, err := time.Parse("2006-01-02", c.Query("date"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "date must use YYYY-MM-DD"})
		return
	}
	lessons, err := h.daily.Execute(c.Request.Context(), date)
	if err != nil {
		writeError(c, err)
		return
	}
	response := make([]lessonResponse, 0, len(lessons))
	for _, lesson := range lessons {
		response = append(response, toLessonResponse(lesson))
	}
	c.JSON(http.StatusOK, response)
}

func (h *LessonHandler) rescheduleLesson(c *gin.Context) {
	id, ok := lessonID(c)
	if !ok {
		return
	}
	var request rescheduleLessonRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	lesson, err := h.reschedule.Execute(c.Request.Context(), id, request.Date)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toLessonResponse(lesson))
}

func (h *LessonHandler) cancelLesson(c *gin.Context) {
	id, ok := lessonID(c)
	if !ok {
		return
	}
	lesson, err := h.cancel.Execute(c.Request.Context(), id)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toLessonResponse(lesson))
}

func (h *LessonHandler) reopenLesson(c *gin.Context) {
	id, ok := lessonID(c)
	if !ok {
		return
	}
	lesson, err := h.lessons.GetByID(c.Request.Context(), id)
	if err != nil {
		writeError(c, err)
		return
	}
	if lesson.Status != domain.LessonStatusCompleted {
		c.JSON(http.StatusConflict, errorResponse{Error: "only completed lessons can be reopened"})
		return
	}
	lesson.Status = domain.LessonStatusScheduled
	lesson.Amount = 0
	lesson.PaidAmount = 0
	lesson.PaymentMethod = ""
	lesson.Attendance = domain.AttendancePresent
	lesson.PaymentStatus = domain.PaymentStatusPending
	if err := h.lessons.Update(c.Request.Context(), lesson); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toLessonResponse(lesson))
}

type lessonPaymentRequest struct {
	Amount        float64 `json:"amount" binding:"required,gt=0"`
	PaymentMethod string  `json:"paymentMethod" binding:"required"`
}

type batchPaymentRequest struct {
	LessonIDs     []uuid.UUID `json:"lessonIds" binding:"required,min=1"`
	Amount        float64     `json:"amount" binding:"required,gt=0"`
	PaymentMethod string      `json:"paymentMethod" binding:"required"`
}

type batchPaymentResponse struct {
	AppliedAmount float64          `json:"appliedAmount"`
	Lessons       []lessonResponse `json:"lessons"`
}

func (h *LessonHandler) registerLessonPayment(c *gin.Context) {
	id, ok := lessonID(c)
	if !ok {
		return
	}
	var request lessonPaymentRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	if !validPaymentMethod(request.PaymentMethod) {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "payment method must be cash or transfer"})
		return
	}
	lesson, err := h.lessons.GetByID(c.Request.Context(), id)
	if err != nil {
		writeError(c, err)
		return
	}
	remaining, valid := payableRemaining(lesson)
	if !valid || request.Amount > remaining+0.001 {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "payment exceeds the lesson balance"})
		return
	}
	applyPayment(&lesson, request.Amount, domain.PaymentMethod(request.PaymentMethod))
	if err := h.lessons.Update(c.Request.Context(), lesson); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toLessonResponse(lesson))
}

func (h *LessonHandler) resetLessonPayment(c *gin.Context) {
	id, ok := lessonID(c)
	if !ok {
		return
	}
	lesson, err := h.lessons.GetByID(c.Request.Context(), id)
	if err != nil {
		writeError(c, err)
		return
	}
	if lesson.Status != domain.LessonStatusCompleted || !hasChargeableAttendance(lesson.Attendance) {
		c.JSON(http.StatusConflict, errorResponse{Error: "this lesson has no editable payment"})
		return
	}
	lesson.PaidAmount = 0
	lesson.PaymentStatus = domain.PaymentStatusPending
	lesson.PaymentMethod = ""
	if err := h.lessons.Update(c.Request.Context(), lesson); err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toLessonResponse(lesson))
}

func (h *LessonHandler) registerBatchPayment(c *gin.Context) {
	var request batchPaymentRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	if !validPaymentMethod(request.PaymentMethod) {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "payment method must be cash or transfer"})
		return
	}
	lessons := make([]domain.Lesson, 0, len(request.LessonIDs))
	totalRemaining := 0.0
	for _, id := range request.LessonIDs {
		lesson, err := h.lessons.GetByID(c.Request.Context(), id)
		if err != nil {
			writeError(c, err)
			return
		}
		remaining, valid := payableRemaining(lesson)
		if valid && remaining > 0 {
			lessons = append(lessons, lesson)
			totalRemaining += remaining
		}
	}
	if len(lessons) == 0 || request.Amount > totalRemaining+0.001 {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "payment exceeds the selected balance"})
		return
	}
	left := request.Amount
	response := make([]lessonResponse, 0, len(lessons))
	for _, lesson := range lessons {
		if left <= 0 {
			break
		}
		remaining, _ := payableRemaining(lesson)
		allocation := left
		if allocation > remaining {
			allocation = remaining
		}
		applyPayment(&lesson, allocation, domain.PaymentMethod(request.PaymentMethod))
		if err := h.lessons.Update(c.Request.Context(), lesson); err != nil {
			writeError(c, err)
			return
		}
		left -= allocation
		response = append(response, toLessonResponse(lesson))
	}
	c.JSON(http.StatusOK, batchPaymentResponse{AppliedAmount: request.Amount - left, Lessons: response})
}

func payableRemaining(lesson domain.Lesson) (float64, bool) {
	if lesson.Status != domain.LessonStatusCompleted || !hasChargeableAttendance(lesson.Attendance) {
		return 0, false
	}
	remaining := lesson.Amount - lesson.PaidAmount
	if remaining < 0 {
		remaining = 0
	}
	return remaining, true
}

func hasChargeableAttendance(attendance domain.Attendance) bool {
	return attendance == domain.AttendancePresent || attendance == domain.AttendanceAbsentUnexcused
}

func applyPayment(lesson *domain.Lesson, amount float64, method domain.PaymentMethod) {
	if lesson.PaidAmount > 0 && lesson.PaymentMethod != "" && lesson.PaymentMethod != method {
		lesson.PaymentMethod = domain.PaymentMethodMixed
	} else {
		lesson.PaymentMethod = method
	}
	lesson.PaidAmount += amount
	if lesson.PaidAmount+0.001 >= lesson.Amount {
		lesson.PaidAmount = lesson.Amount
		lesson.PaymentStatus = domain.PaymentStatusPaid
	} else {
		lesson.PaymentStatus = domain.PaymentStatusPending
	}
}

func validPaymentMethod(value string) bool {
	method := domain.PaymentMethod(value)
	return method == domain.PaymentMethodCash || method == domain.PaymentMethodTransfer
}

func lessonID(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid lesson id"})
		return uuid.Nil, false
	}
	return id, true
}
func toLessonResponse(l domain.Lesson) lessonResponse {
	return lessonResponse{
		ID:                  l.ID,
		StudentID:           l.StudentID,
		Date:                l.Date,
		RealDurationMinutes: l.RealDurationMinutes,
		Status:              string(l.Status),
		Attendance:          string(l.Attendance),
		PaymentStatus:       string(l.PaymentStatus),
		Amount:              l.Amount,
		HourlyRate:          l.HourlyRate,
		PaidAmount:          l.PaidAmount,
		PaymentMethod:       string(l.PaymentMethod),
		TopicNotes:          l.TopicNotes,
	}
}
func writeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		c.JSON(http.StatusNotFound, errorResponse{Error: "lesson not found"})
	case errors.Is(err, domain.ErrInvalidInput):
		c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid input"})
	case errors.Is(err, domain.ErrInvalidState):
		c.JSON(http.StatusConflict, errorResponse{Error: "operation is not valid for this lesson"})
	default:
		c.JSON(http.StatusInternalServerError, errorResponse{Error: "internal server error"})
	}
}
