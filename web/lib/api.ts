// In development, the Fastify API runs on port 3000.
// Set NEXT_PUBLIC_API_URL in .env.local to override.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function apiFetch(path: string, options?: RequestInit) {
  try {
    const res = await fetch(`${API_URL}${path}`, options);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      throw new Error('Cannot reach the API server. Make sure it is running on ' + API_URL);
    }
    throw err;
  }
}

export async function startAnalysis(data: {
  claimText: string;
  jurisdictions: string[];
  technicalSpec?: string;
}) {
  return apiFetch('/api/v1/analyses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function getAnalysis(id: string) {
  return apiFetch(`/api/v1/analyses/${id}`);
}

export async function listAnalyses(limit = 20, offset = 0) {
  return apiFetch(`/api/v1/analyses?limit=${limit}&offset=${offset}`);
}

export async function uploadFileAndAnalyze(file: File, jurisdictions: string[]) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('jurisdictions', jurisdictions.join(','));

  return apiFetch('/api/v1/analyses', {
    method: 'POST',
    body: formData,
  });
}
