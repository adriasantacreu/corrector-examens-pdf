export const agentDebugLog = (
    hypothesisId: string,
    location: string,
    message: string,
    data: any = {},
    runId: string = 'initial'
) => {
    // #region agent log
    fetch('http://127.0.0.1:7480/ingest/a6df652c-8a3b-4565-80ea-18f2b272eb6e', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': '4dc664'
        },
        body: JSON.stringify({
            sessionId: '4dc664',
            runId,
            hypothesisId,
            location,
            message,
            data,
            timestamp: Date.now()
        })
    }).catch(() => { });
    // #endregion
};
