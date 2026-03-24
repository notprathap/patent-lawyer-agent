const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function startAnalysis(data: {
  claimText: string;
  jurisdictions: string[];
  technicalSpec?: string;
}) {
  const res = await fetch(`${API_URL}/api/v1/analyses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getAnalysis(id: string) {
  const res = await fetch(`${API_URL}/api/v1/analyses/${id}`);
  return res.json();
}

export async function listAnalyses(limit = 20, offset = 0) {
  const res = await fetch(`${API_URL}/api/v1/analyses?limit=${limit}&offset=${offset}`);
  return res.json();
}

export async function uploadFileAndAnalyze(file: File, jurisdictions: string[]) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('jurisdictions', jurisdictions.join(','));

  const res = await fetch(`${API_URL}/api/v1/analyses`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}
