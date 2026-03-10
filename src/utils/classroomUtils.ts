import type { Student } from '../types';

export const fetchClassroomStudents = async (accessToken: string, courseId: string) => {
    try {
        const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await res.json();
        return data.students || [];
    } catch (err) {
        console.error("[classroomUtils] Error fetching students", err);
        throw err;
    }
};

export const matchClassroomStudents = (students: Student[], classroomStudents: any[]) => {
    const updatedStudents = students.map(s => ({ ...s }));
    let matchesFound = 0;

    classroomStudents.forEach((cs: any) => {
        const fullName = cs.profile.name.fullName.toLowerCase();
        const email = cs.profile.emailAddress;

        const match = updatedStudents.find(s => {
            const localName = s.name.toLowerCase();
            // Fuzzy match: check if names are contained in each other
            return fullName.includes(localName) || localName.includes(fullName);
        });

        if (match) {
            match.email = email;
            matchesFound++;
        }
    });

    return { updatedStudents, matchesFound };
};
