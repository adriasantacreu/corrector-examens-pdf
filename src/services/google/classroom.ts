import type { ClassroomCourse, ClassroomStudent } from '../../types';
import { googleListAll } from './googleApi';

const BASE = 'https://classroom.googleapis.com/v1';

export const fetchActiveCourses = (token: string) =>
    googleListAll<ClassroomCourse>(`${BASE}/courses?courseStates=ACTIVE&pageSize=100`, token, 'courses');

/** Tots els alumnes del curs (paginant: abans només arribaven els primers 30). */
export const fetchCourseStudents = (token: string, courseId: string) =>
    googleListAll<ClassroomStudent>(`${BASE}/courses/${encodeURIComponent(courseId)}/students?pageSize=100`, token, 'students');
