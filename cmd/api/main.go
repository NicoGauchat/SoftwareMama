package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"

	"softwaremama/internal/delivery/http/handler"
	"softwaremama/internal/repository/sqlite"
	"softwaremama/internal/usecase"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "file:softwaremama.db"
	}

	db, err := sqlite.Open(databaseURL, os.Getenv("TURSO_AUTH_TOKEN"))
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := sqlite.Migrate(ctx, db); err != nil {
		log.Fatalf("migrate database: %v", err)
	}

	repos := sqlite.NewRepositories(db)
	studentHandler := handler.NewStudentHandler(repos.Students, repos.Guardians)
	teacherHandler := handler.NewTeacherHandler(repos.Teachers)
	academicHandler := handler.NewAcademicHandler(repos.Academics, repos.Students)
	lessonHandler := handler.NewLessonHandler(
		usecase.NewCompleteLesson(repos.Lessons, repos.Students),
		usecase.NewGetDailyLessons(repos.Lessons),
		usecase.NewRescheduleLesson(repos.Lessons),
		usecase.NewCancelLesson(repos.Lessons),
		repos.Lessons,
	)

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), cors())
	router.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	api := router.Group("/api/v1")
	lessonHandler.RegisterRoutes(api)
	studentHandler.RegisterRoutes(api)
	teacherHandler.RegisterRoutes(api)
	academicHandler.RegisterRoutes(api)

	address := os.Getenv("HTTP_ADDR")
	if address == "" {
		address = ":8080"
	}
	if err := router.Run(address); err != nil {
		log.Fatalf("run server: %v", err)
	}
}

func cors() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "http://localhost:5173")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == http.MethodOptions {
			c.Status(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
