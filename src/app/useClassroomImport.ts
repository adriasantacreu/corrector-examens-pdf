import { useCallback, useState } from 'react';
import { classroomName, matchClassroomStudents, mergeNameLists } from '../domain/students';
import { fetchCourseStudents } from '../services/google/classroom';
import type { ShowToast } from '../state/useDialogs';
import type { SessionStore } from '../state/useSessionStore';

/** Importa la llista d'alumnes d'un curs de Classroom a la sessió (noms, correus i vinculació). */
export function useClassroomImport(store: SessionStore, accessToken: string | null, showToast: ShowToast, handleApiError: (e: unknown) => boolean) {
    const [isImporting, setIsImporting] = useState(false);

    const importCourse = useCallback(async (courseId: string) => {
        if (!accessToken || !courseId || !store.session) return;
        setIsImporting(true);
        showToast('Classroom', 'Sincronitzant amb Classroom...', 'loading');
        try {
            const roster = await fetchCourseStudents(accessToken, courseId);
            store.update(s => {
                const emailMap = { ...s.studentEmailMap };
                for (const cs of roster) {
                    const name = cs.profile?.name?.fullName;
                    if (name && cs.profile?.emailAddress) emailMap[name] = cs.profile.emailAddress;
                }
                return {
                    classroomStudents: roster,
                    studentList: mergeNameLists(s.studentList, roster.map(classroomName)),
                    studentEmailMap: emailMap,
                    students: s.students.length ? matchClassroomStudents(s.students, roster).updatedStudents : s.students,
                };
            });
            showToast('Èxit', 'Alumnes importats correctament', 'success');
        } catch (err) {
            if (!handleApiError(err)) console.error('[classroom]', err);
            showToast('Error Classroom', 'Error sincronitzant amb Classroom.', 'error');
        } finally {
            setIsImporting(false);
        }
    }, [accessToken, store, showToast, handleApiError]);

    return { importCourse, isImporting };
}
