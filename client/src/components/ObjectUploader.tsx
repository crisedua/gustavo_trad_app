import { useState } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import XHRUpload from "@uppy/xhr-upload";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  buttonClassName?: string;
  children: ReactNode;
}

/**
 * A file upload component that renders as a button and provides a modal interface for
 * file management.
 * 
 * Features:
 * - Renders as a customizable button that opens a file upload modal
 * - Provides a modal interface for:
 *   - File selection
 *   - File preview
 *   - Upload progress tracking
 *   - Upload status display
 * 
 * The component uses Uppy under the hood to handle all file upload functionality.
 * All file management features are automatically handled by the Uppy dashboard modal.
 * 
 * @param props - Component props
 * @param props.maxNumberOfFiles - Maximum number of files allowed to be uploaded
 *   (default: 1)
 * @param props.maxFileSize - Maximum file size in bytes (default: 10MB)
 * @param props.onGetUploadParameters - Function to get upload parameters (method and URL).
 *   Typically used to fetch a presigned URL from the backend server for direct-to-S3
 *   uploads.
 * @param props.onComplete - Callback function called when upload is complete. Typically
 *   used to make post-upload API calls to update server state and set object ACL
 *   policies.
 * @param props.buttonClassName - Optional CSS class name for the button
 * @param props.children - Content to be rendered inside the button
 */
export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  
  // Check if we're in a Render environment or production
  const isRenderEnvironment = window.location.hostname.includes('render.com') || 
                              window.location.hostname.includes('onrender.com') ||
                              process.env.NODE_ENV === 'production';

  const [uppy] = useState(() => {
    const uppyInstance = new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
      },
      autoProceed: false,
    });

    if (isRenderEnvironment) {
      // Use XHR upload for Render - get upload URL first, then upload to that endpoint
      uppyInstance.use(XHRUpload, {
        endpoint: async (file) => {
          try {
            // Get the upload URL from the server
            const uploadParams = await onGetUploadParameters();
            return uploadParams.url;
          } catch (error) {
            console.error('Failed to get upload URL:', error);
            throw error;
          }
        },
        method: 'PUT',
        formData: false, // Send raw file data for PUT requests
        fieldName: 'file',
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        getResponseData: (responseText, response) => {
          try {
            const data = JSON.parse(responseText);
            console.log('Render upload response:', data);
            // Return the path as uploadURL for compatibility
            return {
              uploadURL: data.path,
              path: data.path,
              fileId: data.fileId,
              success: data.success
            };
          } catch (e) {
            console.error('Failed to parse upload response:', e, 'Response:', responseText);
            return { uploadURL: '', path: '' };
          }
        }
      });
    } else {
      // Use AWS S3 for Replit/development
      uppyInstance.use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: onGetUploadParameters,
      });
    }

    // Handle upload success to store response data
    uppyInstance.on('upload-success', (file, response) => {
      console.log('Upload success event:', file, response);
      // Store the response data on the file object for later access
      if (file && response && response.body) {
        const responseData = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
        file.uploadURL = responseData.path || responseData.uploadURL || file.uploadURL;
        file.path = responseData.path;
        file.fileId = responseData.fileId;
      }
    });

    return uppyInstance.on("complete", (result) => {
      onComplete?.(result);
    });
  });

  return (
    <div>
      <div onClick={() => setShowModal(true)} className={buttonClassName}>
        {children}
      </div>

      <DashboardModal
        uppy={uppy}
        open={showModal}
        onRequestClose={() => setShowModal(false)}
        proudlyDisplayPoweredByUppy={false}
      />
    </div>
  );
}
