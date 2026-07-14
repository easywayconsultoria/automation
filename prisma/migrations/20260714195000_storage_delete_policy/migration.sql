CREATE POLICY "workspace members delete process documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'process-documents'
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = (storage.foldername(name))[1]::uuid
      AND wm.user_id = auth.uid()
  )
);
