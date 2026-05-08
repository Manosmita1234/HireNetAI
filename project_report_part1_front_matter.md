
# HireNetAI
## An AI-Powered Video Interview & Personality Pre-Selection Platform

---

A project submitted for the partial fulfilment of award of the degree

**Bachelor in Computer Science**

by

**[Student Name]**
Roll No: ___________

Under the supervision of

**[Supervisor Name]**
[Designation]

---

Department of Computer Science
Ravenshaw University,
Cuttack, Odisha-753003, INDIA
May-2026

---

---

## DECLARATION

I, ……………………, hereby declare that the work being presented in the project entitled **"HireNetAI – An AI-Powered Video Interview & Personality Pre-Selection Platform"** in partial fulfillment of the requirements for the award of the degree of Bachelor in Computer Science and submitted to Ravenshaw University, Cuttack is an authentic record of my own work under the guidance of ……………………………………. I have not submitted the matter embodied in this dissertation for the award of any other degree of this or any other University / Institute.

Place: &emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; Student Name

Date: &emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; Roll No:

---

---

## PROJECT APPROVAL

The dissertation entitled **"HireNetAI – An AI-Powered Video Interview & Personality Pre-Selection Platform"** submitted by ………….. bearing Roll No…………….. is approved for the award of the degree Bachelor in Computer Science.

&emsp;&emsp;&emsp;&emsp;……………………. &emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;………………………..

&emsp;&emsp;&emsp;&emsp;&emsp;External &emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; Supervisor

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; ……………………………………….

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; HOD, Dept. of Computer Science

---

---

## CERTIFICATE OF PLAGIARISM

This is to certify that the project entitled **"HireNetAI – An AI-Powered Video Interview & Personality Pre-Selection Platform"** submitted by ………….. bearing Roll No…………….. for the award of degree of Bachelor in Computer Science was subjected to similarity check verification of the body of the project (excluding references) by plagiarism check software "Turnitin". The dissertation contains a similarity of ……% and the report is attached for reference.

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;

Student Name &emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; Supervisor

Roll No:

---

---

## ACKNOWLEDGEMENT

To begin with, I would like to express my heartfelt appreciation to my supervisor ………………………………. of the Department of Computer Science at Ravenshaw University, Cuttack for his/her guidance, support, and encouragement throughout the dissertation. He/she enlightened me with numerous novel concepts that serve as the framework for this dissertation.

I would also like to offer my heartfelt appreciation to HOD …………… Department of Computer Science at Ravenshaw for his guidance, help, and useful suggestions.

I want to express my gratitude to all the faculty members of Department of Computer Science at Ravenshaw University, for their time-to-time suggestions and co-operations.

I am pleased for being a small part of such a great organization and looking forward to contribute to the organization in future.

---

---

## ABSTRACT

The rapid advancement of artificial intelligence has created unprecedented opportunities in human resource management, particularly in the domain of automated candidate screening and evaluation. HireNetAI is a full-stack, AI-powered video interview and personality pre-selection platform designed to automate and standardize the candidate evaluation process by combining speech recognition, facial emotion analysis, and large language model (LLM)-based natural language understanding.

The platform enables candidates to participate in structured video interviews by uploading resume documents, from which technical skills are automatically extracted and personalized interview questions are generated using OpenAI's GPT-4o-mini model. Candidates record video responses to each question through a browser-based interface powered by the MediaRecorder API. These video responses are then processed through a multi-stage AI pipeline comprising: (1) audio extraction using FFmpeg, (2) speech-to-text transcription with word-level timestamps using WhisperX, (3) facial presence detection using OpenCV's Haar Cascade classifier, (4) facial emotion analysis using DeepFace, and (5) LLM-based answer evaluation assessing clarity, logic, relevance, confidence, and personality traits.

Each answer receives a weighted score, and a session-level aggregate score maps candidates to one of four categories: Highly Recommended (≥ 8.0), Recommended (≥ 6.0), Average (≥ 4.0), or Not Recommended (< 4.0). The system additionally generates holistic evaluation reports across all question-answer pairs and computes a role-fit decision (Hire / Consider / Reject) from an exported JSON transcript. A PDF report is auto-generated using ReportLab and is available for download by administrators through a secure admin dashboard. The platform implements JWT-based authentication, role-based access control, and stores all data in MongoDB using the Motor async driver.

**Keywords:** Artificial Intelligence, Video Interview, Speech Recognition, WhisperX, Emotion Detection, DeepFace, OpenCV, Large Language Model, FastAPI, React, MongoDB, Automated Candidate Evaluation, Personality Assessment, Role-Fit Scoring.

---

---

## CONTENTS

| No. | Chapter Title | Page No. |
|-----|---------------|----------|
| 1 | Introduction | |
| 2 | Objective and Scope of Project | |
| 3 | System Study (Existing System, Proposed System, Feasibility Study) | |
| 4 | System Analysis (Flowchart, ER Diagram, Functional & Non-Functional Requirements, DFD) | |
| 5 | System Design (Screen Design, Database Design, I/O Form Design) | |
| 6 | Development (Environment, Coding) | |
| 7 | Testing | |
| 8 | Conclusion (Findings, Limitations, Future Scope) | |
| 9 | References | |
| 10 | Plagiarism Report | |

---

---

## LIST OF FIGURES

| Figure No. | Description | Page No. |
|------------|-------------|----------|
| Fig 1.1 | HireNetAI System Architecture Overview | |
| Fig 3.1 | Existing Manual Interview Process Flow | |
| Fig 3.2 | Proposed AI-Powered Interview System Flow | |
| Fig 4.1 | High-Level System Flowchart | |
| Fig 4.2 | Entity-Relationship (ER) Diagram | |
| Fig 4.3 | Level-0 Data Flow Diagram (Context Diagram) | |
| Fig 4.4 | Level-1 Data Flow Diagram | |
| Fig 4.5 | AI Processing Pipeline Flowchart | |
| Fig 5.1 | Landing Page Screen Design | |
| Fig 5.2 | Interview Room Screen Design | |
| Fig 5.3 | Admin Dashboard Screen Design | |
| Fig 5.4 | Candidate Detail Screen Design | |
| Fig 5.5 | Database Schema Design | |
| Fig 6.1 | Development Environment Setup | |

---

---

## LIST OF TABLES

| Table No. | Description | Page No. |
|-----------|-------------|----------|
| Table 3.1 | Comparison: Existing vs. Proposed System | |
| Table 3.2 | Feasibility Analysis Summary | |
| Table 4.1 | Functional Requirements | |
| Table 4.2 | Non-Functional Requirements | |
| Table 4.3 | LLM Evaluation Dimensions | |
| Table 4.4 | Score-to-Category Mapping | |
| Table 5.1 | Database Collections and Fields | |
| Table 5.2 | API Endpoint Summary | |
| Table 6.1 | Technology Stack Summary | |
| Table 6.2 | Backend Dependencies | |
| Table 6.3 | Frontend Dependencies | |
| Table 7.1 | Unit Test Cases | |
| Table 7.2 | Integration Test Cases | |
| Table 7.3 | Test Results Summary | |

---

---

## ABBREVIATIONS

| Abbreviation | Full Form |
|--------------|-----------|
| AI | Artificial Intelligence |
| ML | Machine Learning |
| LLM | Large Language Model |
| NLP | Natural Language Processing |
| API | Application Programming Interface |
| JWT | JSON Web Token |
| REST | Representational State Transfer |
| CORS | Cross-Origin Resource Sharing |
| CRUD | Create, Read, Update, Delete |
| PDF | Portable Document Format |
| JSON | JavaScript Object Notation |
| UI | User Interface |
| UX | User Experience |
| DB | Database |
| HTML | HyperText Markup Language |
| CSS | Cascading Style Sheets |
| JS | JavaScript |
| JSX | JavaScript XML |
| HTTP | Hypertext Transfer Protocol |
| HTTPS | Hypertext Transfer Protocol Secure |
| URL | Uniform Resource Locator |
| FPS | Frames Per Second |
| WAV | Waveform Audio File Format |
| WEBM | Web Media File Format |
| GPU | Graphics Processing Unit |
| CPU | Central Processing Unit |
| SPA | Single Page Application |
| HOD | Head of Department |
