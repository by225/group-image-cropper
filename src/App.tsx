import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
// prettier-ignore
import {
  ChakraProvider, Box, Button, Flex, Grid, GridItem, Image, Modal, ModalOverlay,
  ModalContent, ModalBody, Text, IconButton, useDisclosure, Select, Input,
  VStack, HStack, useToast, extendTheme, ColorModeScript, Switch, FormControl,
  FormLabel, useColorMode, Popover, PopoverTrigger, PopoverContent, PopoverBody,
  PopoverArrow, Spinner, Checkbox, UseToastOptions
} from '@chakra-ui/react';
import { DeleteIcon, InfoIcon } from '@chakra-ui/icons';
import Cropper, { ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import './cropper-custom.css';

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false
  },
  components: {
    Alert: {
      variants: {
        solid: {
          container: {
            color: '#1A202C',
            bg: '#E5C16D',
            _light: {
              bg: '#E5C16D'
            },
            _dark: {
              bg: '#E5C16D'
            }
          },
          icon: {
            color: '#1A202C'
          }
        }
      }
    },
    Toast: {
      defaultProps: {
        variant: 'solid',
        status: 'warning'
      }
    }
  }
});

interface CropSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
}

// url and objectUrl both point to the same resource initially
// url is preserved for history while objectUrl is used for cleanup
interface ImageData {
  id: string;
  file: File;
  url: string;
  objectUrl: string;
  cropped: boolean;
  cropHistory: {
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
  cropSettings?: CropSettings;
}

// Type definition for the modern File System Access API
type ShowSaveFilePicker = (options: {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<{
  createWritable: () => Promise<{
    write: (blob: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

type ToastMessage = UseToastOptions & {
  status: 'warning' | 'error' | 'success' | 'info';
  title: string;
  description: string;
};

const TEXT = {
  TITLE: 'Group Image Cropper',
  THEME: {
    LIGHT: 'Light Mode',
    DARK: 'Dark Mode'
  },
  CROP_MEMORY: {
    LABEL: 'Remember Crop Rectangle:',
    OPTIONS: {
      PER_IMAGE: 'Per Image',
      GLOBAL: 'Global'
    }
  },
  UPLOAD: {
    PROMPT: 'Click here to upload or drop images anywhere (max 10)'
  },
  CROP_HISTORY: {
    TITLE: 'Crop History',
    UNITS: '(in pixels)',
    EMPTY: 'No crops yet',
    COLUMNS: {
      X: 'X',
      Y: 'Y',
      WIDTH: 'Width',
      HEIGHT: 'Height'
    }
  },
  BUTTONS: {
    CROP: 'Crop',
    CANCEL: 'Cancel',
    CROP_DOWNLOAD: 'Crop & Download'
  },
  MODAL: {
    TITLE: 'Crop Image',
    ORIGINAL_LABEL: 'Original:',
    ASPECT_RATIO_LABEL: 'Aspect Ratio:',
    ASPECT_RATIOS: {
      FREE: {
        VALUE: 'free',
        LABEL: 'Free-form'
      },
      ORIGINAL: {
        VALUE: 'original',
        LABEL: 'Original'
      },
      SQUARE: {
        VALUE: '1:1',
        LABEL: '1:1'
      }
    },
    SAVE_ON_CANCEL: 'Save on Cancel'
  },
  TOASTS: {
    LIMIT: {
      TITLE: 'Images ignored',
      DESC: {
        AT_LIMIT: (count: number) =>
          `${count} ${count === 1 ? 'image' : 'images'} ignored because of limit`,
        PARTIAL: (added: number, ignored: number) =>
          `${added === 1 ? 'First image' : `First ${added} images`} added, ${ignored} ${ignored === 1 ? 'image was' : 'images were'} ignored due to limit.`
      }
    },
    DUPLICATES: {
      TITLE: 'Duplicates detected',
      DESC: (count: number) =>
        `${count} duplicate ${count === 1 ? 'file was' : 'files were'} ignored`
    },
    INVALID_TYPE: {
      TITLE: 'Invalid files',
      DESC: (count: number) =>
        `${count} ${count === 1 ? 'file' : 'files'} ignored (only ${Object.values(ACCEPTED_TYPES).flat().join(', ')} files are accepted)`
    },
    FILE_SIZE: {
      TITLE: 'File too large',
      DESC: (filename: string) => `${filename} exceeds maximum size of 10MB`
    },
    MIME_MISMATCH: {
      TITLE: 'Mismatched file type',
      DESC: (filename: string, mimeType: string) =>
        `${filename}: File extension doesn't match its content type (${mimeType})`
    },
    INVALID_IMAGES: {
      TITLE: 'Invalid images',
      DESC: (count: number) =>
        `${count} ${count === 1 ? 'image was' : 'images were'} invalid or corrupted`
    },
    LOAD_ERROR: {
      TITLE: 'Error',
      DESC: 'Failed to load image'
    }
  },
  OVERLAY: {
    PROCESSING: 'Processing images...'
  }
};

const ACCEPTED_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp']
};

const TIMING = {
  DEBOUNCE: 50,
  FADE_OUT: 200,
  TOAST_DELAY: 300,
  TRANSITION: '0.2s'
};

const CROP_SIZE = {
  MIN: 10,
  MAX: 10000
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const ImageCropperApp: React.FC = () => {
  const [images, setImages] = useState<ImageData[]>([]);
  const [currentImage, setCurrentImage] = useState<ImageData | null>(null);
  const [activeCropSettings, setActiveCropSettings] = useState<CropSettings>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    aspectRatio: 0
  });
  const [globalCropSettings, setGlobalCropSettings] = useState<CropSettings | null>(null);
  const [isPerImageCrop, setIsPerImageCrop] = useState(true);
  const [originalDimensions, setOriginalDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(
    TEXT.MODAL.ASPECT_RATIOS.FREE.VALUE
  );
  const [saveOnCancel, setSaveOnCancel] = useState(false);
  const [initialCropSettings, setInitialCropSettings] = useState<CropSettings | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { colorMode, toggleColorMode } = useColorMode();
  const toast = useToast({
    position: 'bottom',
    duration: 6000,
    isClosable: true,
    variant: 'solid',
    status: 'warning'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<ReactCropperElement>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const objectUrlsToCleanup = useRef<string[]>([]);

  const existingFilenames = useMemo(() => new Set(images.map((img) => img.file.name)), [images]);

  const addUrlForCleanup = (url: string) => {
    objectUrlsToCleanup.current.push(url);
  };

  const removeUrlFromCleanup = (url: string) => {
    objectUrlsToCleanup.current = objectUrlsToCleanup.current.filter((u) => u !== url);
  };

  const createToastMessage = useCallback(
    (
      type:
        | 'limit'
        | 'duplicate'
        | 'invalid-type'
        | 'file-size'
        | 'mime-mismatch'
        | 'invalid-image'
        | 'load-error',
      params?: {
        count?: number;
        filename?: string;
        mimeType?: string;
        added?: number;
        ignored?: number;
      },
      immediate = false
    ): ToastMessage => {
      const message: ToastMessage = {
        position: 'bottom',
        duration: 6000,
        isClosable: true,
        variant: 'solid',
        status: 'warning',
        title: '',
        description: ''
      };

      switch (type) {
        case 'limit':
          message.title = TEXT.TOASTS.LIMIT.TITLE;
          if (params?.ignored === undefined) {
            message.description = TEXT.TOASTS.LIMIT.DESC.AT_LIMIT(params?.count || 0);
          } else {
            message.description = TEXT.TOASTS.LIMIT.DESC.PARTIAL(params.added || 0, params.ignored);
          }
          break;

        case 'duplicate':
          message.title = TEXT.TOASTS.DUPLICATES.TITLE;
          message.description = TEXT.TOASTS.DUPLICATES.DESC(params?.count || 0);
          break;

        case 'invalid-type':
          message.title = TEXT.TOASTS.INVALID_TYPE.TITLE;
          message.description = TEXT.TOASTS.INVALID_TYPE.DESC(params?.count || 0);
          break;

        case 'file-size':
          message.title = TEXT.TOASTS.FILE_SIZE.TITLE;
          message.description = TEXT.TOASTS.FILE_SIZE.DESC(params?.filename || '');
          break;

        case 'mime-mismatch':
          message.title = TEXT.TOASTS.MIME_MISMATCH.TITLE;
          message.description = TEXT.TOASTS.MIME_MISMATCH.DESC(
            params?.filename || '',
            params?.mimeType || ''
          );
          break;

        case 'invalid-image':
          message.status = 'error';
          message.title = TEXT.TOASTS.INVALID_IMAGES.TITLE;
          message.description = TEXT.TOASTS.INVALID_IMAGES.DESC(params?.count || 0);
          break;

        case 'load-error':
          message.status = 'error';
          message.title = TEXT.TOASTS.LOAD_ERROR.TITLE;
          message.description = TEXT.TOASTS.LOAD_ERROR.DESC;
          break;
      }

      if (immediate) {
        toast(message);
      }

      return message;
    },
    [toast]
  );

  const validateImage = useCallback((file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const img = new window.Image();
        const objectUrl = URL.createObjectURL(file);
        addUrlForCleanup(objectUrl);
        const timeout = setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          removeUrlFromCleanup(objectUrl);
          resolve(false);
        }, 10000);

        img.onload = () => {
          clearTimeout(timeout);
          URL.revokeObjectURL(objectUrl);
          removeUrlFromCleanup(objectUrl);
          // Check for valid dimensions
          if (
            img.width === 0 ||
            img.height === 0 ||
            img.width > CROP_SIZE.MAX ||
            img.height > CROP_SIZE.MAX ||
            img.width < CROP_SIZE.MIN ||
            img.height < CROP_SIZE.MIN
          ) {
            resolve(false);
            return;
          }

          // Test image integrity by attempting to draw and read a 1x1 sample
          try {
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(img.width, 1);
            canvas.height = Math.min(img.height, 1);
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(false);
              return;
            }

            ctx.drawImage(img, 0, 0, 1, 1);
            ctx.getImageData(0, 0, 1, 1);

            resolve(true);
          } catch (error) {
            console.error('Image validation failed:', error);
            resolve(false);
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          URL.revokeObjectURL(objectUrl);
          removeUrlFromCleanup(objectUrl);
          resolve(false);
        };

        img.src = objectUrl;
      } catch (error) {
        console.warn('Image validation failed:', error);
        resolve(false);
      }
    });
  }, []);

  const processFiles = useCallback(
    (files: File[]) => {
      if (isProcessing) return;
      if (files.length === 0) return;

      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }

      toast.closeAll();
      setIsProcessing(true);

      processingTimeoutRef.current = setTimeout(async () => {
        const messages: Array<{
          title: string;
          description: string;
          status: 'warning' | 'success' | 'error' | 'info';
        }> = [];

        // Check limit first
        const remainingSlots = Math.max(0, 10 - images.length);
        if (remainingSlots === 0) {
          messages.push(createToastMessage('limit', { count: files.length }));
          setTimeout(() => setIsProcessing(false), TIMING.FADE_OUT);
          setTimeout(
            () => messages.forEach((msg) => toast(msg)),
            TIMING.TOAST_DELAY
          );
          return;
        }

        // Filter out non-image files by size & MIME type
        const imageFiles = files.filter((f) => {
          if (!Object.keys(ACCEPTED_TYPES).includes(f.type)) return false;

          if (f.size > MAX_FILE_SIZE) {
            messages.push(createToastMessage('file-size', { filename: f.name }));
            return false;
          }

          const extension = getFileExtension(f.name);
          const acceptedExtensions = ACCEPTED_TYPES[f.type];
          if (!acceptedExtensions.includes(`.${extension}`)) {
            messages.push(createToastMessage('mime-mismatch', { filename: f.name, mimeType: f.type }));
            return false;
          }

          return true;
        });
        const invalidTypeCount = files.length - imageFiles.length;

        if (invalidTypeCount > 0) {
          messages.push(createToastMessage('invalid-type', { count: invalidTypeCount }));
          if (imageFiles.length === 0) {
            setTimeout(() => setIsProcessing(false), TIMING.FADE_OUT);
            setTimeout(
              () => messages.forEach((msg) => toast(msg)),
              TIMING.TOAST_DELAY
            );
            return;
          }
        }

        // Filter duplicates
        const nonDuplicateFiles = imageFiles.filter(
          (file) => !existingFilenames.has(file.name)
        );
        const duplicateCount = imageFiles.length - nonDuplicateFiles.length;

        if (duplicateCount > 0) {
          messages.push(createToastMessage('duplicate', { count: duplicateCount }));
          if (nonDuplicateFiles.length === 0) {
            setTimeout(() => setIsProcessing(false), TIMING.FADE_OUT);
            setTimeout(
              () => messages.forEach((msg) => toast(msg)),
              TIMING.TOAST_DELAY
            );
            return;
          }
        }

        // Process files: validate images, create object URLs, and update state
        const filesToProcess = nonDuplicateFiles.slice(0, remainingSlots);
        const ignoredDueToLimit = Math.max(
          0,
          nonDuplicateFiles.length - remainingSlots
        );
        let invalidImageCount = 0;

        if (filesToProcess.length === 0) {
          if (ignoredDueToLimit > 0) {
            messages.push(createToastMessage('limit', { added: filesToProcess.length, ignored: ignoredDueToLimit }));
          }
          setTimeout(() => setIsProcessing(false), TIMING.FADE_OUT);
          setTimeout(
            () => messages.forEach((msg) => toast(msg)),
            TIMING.TOAST_DELAY
          );
          return;
        }

        for (const file of filesToProcess) {
          try {
            const isValid = await validateImage(file);
            if (isValid) {
              const objectUrl = URL.createObjectURL(file);
              addUrlForCleanup(objectUrl);
              const newImage = {
                id: `${file.name}-${Date.now()}`,
                file,
                url: objectUrl,
                objectUrl: objectUrl,
                cropped: false,
                cropHistory: []
              };
              setImages((prev) => [...prev, newImage]);
            } else {
              invalidImageCount++;
            }
          } catch (error) {
            console.error('Error processing image:', error);
            invalidImageCount++;
          }
        }

        if (invalidImageCount > 0) {
          messages.push(createToastMessage('invalid-image', { count: invalidImageCount }));
        }

        if (ignoredDueToLimit > 0) {
          messages.push(createToastMessage('limit', { 
            added: filesToProcess.length - invalidImageCount,
            ignored: ignoredDueToLimit 
          }));
        }

        setTimeout(() => setIsProcessing(false), TIMING.FADE_OUT);
        setTimeout(
          () => messages.forEach((msg) => toast(msg)),
          TIMING.TOAST_DELAY
        );
      }, TIMING.DEBOUNCE);
    },
    [images, toast, isProcessing, validateImage, existingFilenames, createToastMessage]
  );

  const updateCropSettings = useCallback((data: Cropper.Data) => {
    const aspectRatio = data.width / data.height;
    const newCropSettings: CropSettings = {
      x: Math.round(data.x),
      y: Math.round(data.y),
      width: Math.round(data.width),
      height: Math.round(data.height),
      aspectRatio
    };
    
    setActiveCropSettings(newCropSettings);
  
    if (isPerImageCrop && currentImage) {
      setImages((prev) =>
        prev.map((img) =>
          img.id === currentImage.id
            ? { ...img, cropSettings: newCropSettings }
            : img
        )
      );
    } else {
      setGlobalCropSettings(newCropSettings);
    }
  }, [currentImage, isPerImageCrop]);

  const getAspectRatioFromSelection = useCallback((value: string): number => {
    switch (value) {
      case TEXT.MODAL.ASPECT_RATIOS.ORIGINAL.VALUE:
        return originalDimensions
          ? originalDimensions.width / originalDimensions.height
          : 0;
      case TEXT.MODAL.ASPECT_RATIOS.SQUARE.VALUE:
        return 1;
      default:
        return 0;
    }
  }, [originalDimensions]);

  const getSelectionFromAspectRatio = (
    ratio: number,
    originalDimensions: { width: number; height: number } | null
  ): string => {
    if (ratio === 1) {
      return TEXT.MODAL.ASPECT_RATIOS.SQUARE.VALUE;
    } else if (
      originalDimensions &&
      Math.abs(ratio - originalDimensions.width / originalDimensions.height) <
        0.0001
    ) {
      return TEXT.MODAL.ASPECT_RATIOS.ORIGINAL.VALUE;
    }
    return TEXT.MODAL.ASPECT_RATIOS.FREE.VALUE;
  };

  const getFileExtension = (filename: string): string => {
    return filename
      .slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2)
      .toLowerCase();
  };

  const formatNumber = (num: number): string => {
    const rounded = Math.round(num);
    return rounded === 0 ? '0' : rounded.toString();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      processFiles(files);
    },
    [processFiles]
  );

  const handleFileInputClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePageClick = useCallback(() => {
    toast.closeAll();
  }, [toast]);
  
  const handleNumericChange = useCallback(
    (key: keyof CropSettings, value: string, isComplete: boolean) => {
      const cropper = cropperRef.current?.cropper;
      if (!cropper) return;

      let cropMax = CROP_SIZE.MAX;
      if (['x', 'y'].includes(key)) {
        cropMax = CROP_SIZE.MAX - CROP_SIZE.MIN;
      }
      let num = Math.min(Number(value), cropMax);

      // For incomplete changes, just update the current input
      if (!isComplete) {
        setActiveCropSettings((prev) => ({
          ...prev,
          [key]: num
        }));
        return;
      }

      const currentData = cropper.getData();
      const canvasData = cropper.getCanvasData();
      const imageWidth = canvasData.naturalWidth;
      const imageHeight = canvasData.naturalHeight;

      const newData = { ...currentData };

      switch (key) {
        case 'x':
          newData.x = Math.max(0, Math.min(imageWidth - currentData.width, num));
          break;
        case 'y':
          newData.y = Math.max(0, Math.min(imageHeight - currentData.height, num));
          break;
        case 'width':
          newData.width = Math.max(CROP_SIZE.MIN, Math.min(imageWidth - currentData.x, num));
          break;
        case 'height':
          newData.height = Math.max(CROP_SIZE.MIN, Math.min(imageHeight - currentData.y, num));
          break;
      }

      cropper.setData(newData);

      const finalData = cropper.getData();

      setActiveCropSettings({
        x: Math.round(finalData.x),
        y: Math.round(finalData.y),
        width: Math.round(finalData.width),
        height: Math.round(finalData.height),
        aspectRatio: activeCropSettings.aspectRatio
      });
    },
    [activeCropSettings.aspectRatio]
  );

  const handleXChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleNumericChange('x', e.target.value, false);
    },
    [handleNumericChange]
  );

  const handleYChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleNumericChange('y', e.target.value, false);
    },
    [handleNumericChange]
  );

  const handleWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleNumericChange('width', e.target.value, false);
    },
    [handleNumericChange]
  );

  const handleHeightChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleNumericChange('height', e.target.value, false);
    },
    [handleNumericChange]
  );

  const handleCropMemoryChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setIsPerImageCrop(e.target.value === 'per-image');
    },
    []
  );

  const handleCropEvent = useCallback(
    (e: Cropper.CropEvent) => {
      if (isClosing) return;
      const cropper = cropperRef.current?.cropper;
      if (!cropper) return;
      
      const data = cropper.getData();
      updateCropSettings(data);
    },
    [isClosing, updateCropSettings]
  );

  const inputProps = useCallback((key: keyof CropSettings) => ({
    size: 'sm' as const,
    w: '70px',
    h: '32px',
    lineHeight: '32px',
    type: 'number' as const,
    onChange:
      key === 'x'
        ? handleXChange
        : key === 'y'
          ? handleYChange
          : key === 'width'
            ? handleWidthChange
            : handleHeightChange,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleNumericChange(key, e.currentTarget.value, true);
      }
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      handleNumericChange(key, e.target.value, true);
    }
  }), [handleXChange, handleYChange, handleWidthChange, handleHeightChange, handleNumericChange]);

  // Opens crop modal with settings based on mode:
  // Per-Image: image settings -> default
  // Global: global -> image -> default
  const openCropModal = (image: ImageData) => {
    setCurrentImage(image);
    const img = new window.Image();

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
    };

    img.onerror = (event) => {
      console.error('Image load error details:', {
        event,
        imageUrl: image.url,
        imageState: image
      });
      cleanup();
      createToastMessage('load-error', undefined, true);
      onClose();
    };

    img.onload = () => {
      const dimensions = { width: img.width, height: img.height };

      setOriginalDimensions(dimensions);

      // Default centered 50% crop
      const defaultSettings: CropSettings = {
        width: dimensions.width / 2,
        height: dimensions.height / 2,
        x: dimensions.width / 4,
        y: dimensions.height / 4,
        aspectRatio: 0
      };

      const initialSettings = isPerImageCrop
        ? image.cropSettings || defaultSettings
        : globalCropSettings || image.cropSettings || defaultSettings;

      setInitialCropSettings(initialSettings);

      setActiveCropSettings(initialSettings);

      const initialAspectRatio = getSelectionFromAspectRatio(
        initialSettings.aspectRatio,
        dimensions
      );
      setSelectedAspectRatio(initialAspectRatio);

      cleanup();
      onOpen();
    };

    img.src = image.url;
  };

  const handleCropperReady = useCallback(() => {
    if (isClosing) return;
    
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    
    if (initialCropSettings) {
      requestAnimationFrame(() => {
        cropper.setData(initialCropSettings);
        const data = cropper.getData();
        updateCropSettings(data);
      });
    }
  }, [initialCropSettings, isClosing, updateCropSettings]);

  // Handles crop & save operation using modern File System API if available
  const handleCrop = async () => {
    const cropper = cropperRef.current?.cropper;
    if (cropper && currentImage) {
      const canvas = cropper.getCroppedCanvas();
      let blob: Blob | null = null;
      try {
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve)
        );
        if (!blob) return;

        const croppedFile = new File(
          [blob],
          `cropped-${currentImage.file.name}`,
          { type: blob.type }
        );
        const data = cropper.getData();

        const newCropSettings: CropSettings = {
          x: data.x,
          y: data.y,
          width: data.width,
          height: data.height,
          aspectRatio: activeCropSettings.aspectRatio
        };

        try {
          const showSaveFilePicker = (window as any).showSaveFilePicker as
            | ShowSaveFilePicker
            | undefined;

          if (showSaveFilePicker) {
            // Create temporary object URL for File System API save
            const saveUrl = URL.createObjectURL(croppedFile);
            addUrlForCleanup(saveUrl);

            // Preserve original image while updating crop-related properties
            setImages((prev) =>
              prev.map((img) =>
                img.id === currentImage.id
                  ? {
                      ...img,
                      cropped: true,
                      cropSettings: newCropSettings,
                      cropHistory: [
                        ...img.cropHistory,
                        {
                          x: Math.round(data.x),
                          y: Math.round(data.y),
                          width: Math.round(data.width),
                          height: Math.round(data.height)
                        }
                      ]
                    }
                  : img
              )
            );

            setGlobalCropSettings(newCropSettings);

            URL.revokeObjectURL(saveUrl);
            removeUrlFromCleanup(saveUrl);
            onClose();
          } else {
            // Create temporary object URL and link for fallback browser download
            const downloadUrl = URL.createObjectURL(croppedFile);
            addUrlForCleanup(downloadUrl);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = croppedFile.name;
            link.click();

            // Preserve original image while updating crop-related properties
            setImages((prev) =>
              prev.map((img) =>
                img.id === currentImage.id
                  ? {
                      ...img,
                      cropped: true,
                      cropSettings: newCropSettings,
                      cropHistory: [
                        ...img.cropHistory,
                        {
                          x: Math.round(data.x),
                          y: Math.round(data.y),
                          width: Math.round(data.width),
                          height: Math.round(data.height)
                        }
                      ]
                    }
                  : img
              )
            );

            setGlobalCropSettings(newCropSettings);

            URL.revokeObjectURL(downloadUrl);
            removeUrlFromCleanup(downloadUrl);
            onClose();
          }
        } catch (err) {
          console.error('Error or cancel occurred:', err);
          // Save crop settings without updating history on error or cancel
          setGlobalCropSettings(newCropSettings);
          setImages((prev) =>
            prev.map((img) =>
              img.id === currentImage.id
                ? {
                    ...img,
                    cropSettings: newCropSettings
                  }
                : img
            )
          );
          onClose();
          return;
        }
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        blob = null;
      }
    }
  };

  // Preserves current crop settings without saving the cropped image
  const handleCancel = () => {
    setIsClosing(true);
    const cropper = cropperRef.current?.cropper;
    if (cropper && currentImage && initialCropSettings) {
      const currentData = cropper.getData();

      const aspectRatio = saveOnCancel
        ? getAspectRatioFromSelection(selectedAspectRatio)
        : getAspectRatioFromSelection('free');

      const newCropSettings: CropSettings = saveOnCancel
        ? {
            x: currentData.x,
            y: currentData.y,
            width: currentData.width,
            height: currentData.height,
            aspectRatio
          }
        : {
            x: initialCropSettings.x,
            y: initialCropSettings.y,
            width: initialCropSettings.width,
            height: initialCropSettings.height,
            aspectRatio
          };

      // Always update the settings (either to current or initial)
      setGlobalCropSettings(newCropSettings);
      setImages((prev) =>
        prev.map((img) =>
          img.id === currentImage.id
            ? {
                ...img,
                cropSettings: newCropSettings
              }
            : img
        )
      );

      if (!saveOnCancel) {
        setSaveOnCancel(false);
        setSelectedAspectRatio('free');
      }

      cropper.destroy();
    }
    onClose();
  };

  // Converts aspect ratio selection to numeric value and updates cropper
  const handleAspectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedAspectRatio(value);

    const aspectRatio = getAspectRatioFromSelection(value);

    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      const currentData = cropper.getData();
      cropper.setAspectRatio(aspectRatio);

      const newCropSettings: CropSettings = {
        x: currentData.x,
        y: currentData.y,
        width: currentData.width,
        height: aspectRatio
          ? currentData.width / aspectRatio
          : currentData.height,
        aspectRatio
      };

      cropper.setData({
        x: newCropSettings.x,
        y: newCropSettings.y,
        width: newCropSettings.width,
        height: newCropSettings.height
      });

      setActiveCropSettings(newCropSettings);

      if (isPerImageCrop && currentImage) {
        setImages((prev) =>
          prev.map((img) =>
            img.id === currentImage.id
              ? { ...img, cropSettings: newCropSettings }
              : img
          )
        );
      } else {
        setGlobalCropSettings(newCropSettings);
      }
    }
  };

  const handleDelete = (id: string) => {
    setImages((prev) => {
      const imageToDelete = prev.find((img) => img.id === id);
      if (imageToDelete?.url) {
        URL.revokeObjectURL(imageToDelete.url);
        removeUrlFromCleanup(imageToDelete.url);
      }
      return prev.filter((img) => img.id !== id);
    });
  };

  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    try {
      const preventDefault = (e: Event) => e.preventDefault();
      window.addEventListener('dragover', preventDefault);
      window.addEventListener('drop', handleDrop as any);
      return () => {
        try {
          window.removeEventListener('dragover', preventDefault);
          window.removeEventListener('drop', handleDrop as any);
        } catch (error) {
          console.warn('Error removing event listeners:', error);
        }
      };
    } catch (error) {
      console.warn('Error setting up drag and drop:', error);
    }
  }, [handleDrop]);

  useEffect(() => {
    return () => {
      objectUrlsToCleanup.current.forEach(url => {
        URL.revokeObjectURL(url);
      });
      objectUrlsToCleanup.current = [];
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setIsClosing(true);
      const cropper = cropperRef.current?.cropper;
      if (cropper) {
        cropper.destroy();
      }
      setActiveCropSettings({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        aspectRatio: 0
      });
      setIsClosing(false);
    }
  }, [isOpen]);

  return (
    <Box
      p={4}
      h="100vh"
      overflow="auto"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={handlePageClick}
    >
      <VStack spacing={4} align="stretch" position="relative">
        <Flex
          gap={6}
          flexWrap="wrap"
          alignItems="center"
          justifyContent="flex-end"
          minH="32px"
        >
          <Text
            fontSize="xl"
            fontWeight="bold"
            whiteSpace="nowrap"
            mr="auto"
            lineHeight="32px"
            h="32px"
            mt="-4px"
          >
            {TEXT.TITLE}
          </Text>
          <FormControl
            display="flex"
            alignItems="center"
            w="auto"
            minW="max-content"
            h="32px"
          >
            <FormLabel
              htmlFor="theme-toggle"
              mb="0"
              whiteSpace="nowrap"
              lineHeight="32px"
              h="32px"
            >
              {colorMode === 'light' ? TEXT.THEME.LIGHT : TEXT.THEME.DARK}
            </FormLabel>
            <Switch
              id="theme-toggle"
              isChecked={colorMode === 'light'}
              onChange={toggleColorMode}
            />
          </FormControl>
          <FormControl
            display="flex"
            alignItems="center"
            w="auto"
            minW="max-content"
            h="32px"
          >
            <FormLabel
              htmlFor="crop-memory"
              mb="0"
              whiteSpace="nowrap"
              lineHeight="32px"
              h="32px"
            >
              {TEXT.CROP_MEMORY.LABEL}
            </FormLabel>
            <Select
              id="crop-memory"
              size="sm"
              width="120px"
              value={isPerImageCrop ? 'per-image' : 'global'}
              onChange={handleCropMemoryChange}
              h="32px"
            >
              <option value="per-image">
                {TEXT.CROP_MEMORY.OPTIONS.PER_IMAGE}
              </option>
              <option value="global">{TEXT.CROP_MEMORY.OPTIONS.GLOBAL}</option>
            </Select>
          </FormControl>
        </Flex>
        <Box
          border="2px dashed"
          borderColor="gray.500"
          px={2}
          py={4}
          textAlign="center"
          cursor="pointer"
          _hover={{ borderColor: 'gray.400' }}
          onClick={handleFileInputClick}
        >
          <Text>{TEXT.UPLOAD.PROMPT}</Text>
        </Box>
        {isProcessing && (
          <Flex
            position="fixed"
            top={0}
            left={0}
            right={0}
            bottom={0}
            zIndex={9999}
            justify="center"
            align="center"
            gap={2}
            color={colorMode === 'light' ? 'blackAlpha.900' : 'whiteAlpha.900'}
            bg={colorMode === 'light' ? 'whiteAlpha.500' : 'blackAlpha.500'}
            transition={`opacity ${TIMING.TRANSITION} ease-in-out`}
            opacity={isProcessing ? 1 : 0}
          >
            <Flex
              bg={colorMode === 'light' ? 'whiteAlpha.900' : 'blackAlpha.900'}
              px={4}
              py={3}
              borderRadius="md"
              align="center"
              gap={2}
            >
              <Spinner size="md" />
              <Text fontWeight="bold">{TEXT.OVERLAY.PROCESSING}</Text>
            </Flex>
          </Flex>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          multiple
          hidden
        />
        <Grid templateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap={4}>
          {images.map((image) => (
            <Box
              key={image.id}
              borderWidth="1px"
              borderRadius="md"
              p={2}
              position="relative"
              display="flex"
              flexDirection="column"
              height="200px"
            >
              <Box
                position="relative"
                flex="1"
                display="flex"
                alignItems="center"
                justifyContent="center"
                overflow="hidden"
                mb={0}
              >
                <Image
                  src={image.url}
                  maxH="150px"
                  maxW="100%"
                  objectFit="contain"
                  width="auto"
                  height="auto"
                />
                <Popover
                  trigger="click"
                  placement="bottom-start"
                  closeOnBlur={true}
                  gutter={4}
                  strategy="fixed"
                >
                  <PopoverTrigger>
                    <IconButton
                      aria-label="Info"
                      icon={<InfoIcon boxSize={4} />}
                      bg={image.cropped ? 'green.500' : 'gray.600'}
                      color="white"
                      opacity={0.9}
                      boxShadow="0 0 4px rgba(0,0,0,0.3)"
                      _hover={{
                        bg: image.cropped ? 'green.600' : 'gray.700',
                        opacity: 1
                      }}
                      _active={{
                        bg: image.cropped ? 'green.700' : 'gray.800'
                      }}
                      height="28px"
                      width="28px"
                      minWidth="28px"
                      padding={0}
                      position="absolute"
                      top={0}
                      left={0}
                    />
                  </PopoverTrigger>
                  <PopoverContent
                    width="auto"
                    maxW="300px"
                    bg="gray.700"
                    borderColor="gray.600"
                    _dark={{
                      bg: 'gray.700',
                      borderColor: 'gray.600'
                    }}
                    py={1}
                    px={2}
                  >
                    <PopoverArrow bg="gray.700" />
                    <PopoverBody p={2}>
                      <VStack align="start" spacing={1} minH="44px">
                        <HStack spacing={1} width="100%" justify="center">
                          <Text fontWeight="bold" fontSize="sm" color="white">
                            {TEXT.CROP_HISTORY.TITLE}
                          </Text>
                          {image.cropHistory.length > 0 && (
                            <Text fontSize="sm" color="gray.300">
                              {TEXT.CROP_HISTORY.UNITS}
                            </Text>
                          )}
                        </HStack>
                        {image.cropHistory.length === 0 ? (
                          <Text fontSize="sm" color="gray.300">
                            {TEXT.CROP_HISTORY.EMPTY}
                          </Text>
                        ) : (
                          <Box>
                            <Grid
                              templateColumns="repeat(4, 1fr)"
                              gap={0}
                              fontSize="sm"
                              color="gray.300"
                            >
                              <GridItem
                                p={1}
                                borderBottom="1px"
                                borderRight="1px"
                                borderColor="gray.600"
                              >
                                <Text fontWeight="medium" textAlign="center">
                                  {TEXT.CROP_HISTORY.COLUMNS.X}
                                </Text>
                              </GridItem>
                              <GridItem
                                p={1}
                                borderBottom="1px"
                                borderRight="1px"
                                borderColor="gray.600"
                              >
                                <Text fontWeight="medium" textAlign="center">
                                  {TEXT.CROP_HISTORY.COLUMNS.Y}
                                </Text>
                              </GridItem>
                              <GridItem
                                p={1}
                                borderBottom="1px"
                                borderRight="1px"
                                borderColor="gray.600"
                              >
                                <Text fontWeight="medium" textAlign="center">
                                  {TEXT.CROP_HISTORY.COLUMNS.WIDTH}
                                </Text>
                              </GridItem>
                              <GridItem
                                p={1}
                                borderBottom="1px"
                                borderColor="gray.600"
                              >
                                <Text fontWeight="medium" textAlign="center">
                                  {TEXT.CROP_HISTORY.COLUMNS.HEIGHT}
                                </Text>
                              </GridItem>
                              {image.cropHistory.map((crop, i) => (
                                <React.Fragment key={i}>
                                  <GridItem
                                    p={1}
                                    borderRight="1px"
                                    borderBottom={
                                      i < image.cropHistory.length - 1
                                        ? '1px'
                                        : '0'
                                    }
                                    borderColor="gray.600"
                                  >
                                    <Text textAlign="right">{crop.x}</Text>
                                  </GridItem>
                                  <GridItem
                                    p={1}
                                    borderRight="1px"
                                    borderBottom={
                                      i < image.cropHistory.length - 1
                                        ? '1px'
                                        : '0'
                                    }
                                    borderColor="gray.600"
                                  >
                                    <Text textAlign="right">{crop.y}</Text>
                                  </GridItem>
                                  <GridItem
                                    p={1}
                                    borderRight="1px"
                                    borderBottom={
                                      i < image.cropHistory.length - 1
                                        ? '1px'
                                        : '0'
                                    }
                                    borderColor="gray.600"
                                  >
                                    <Text textAlign="right">{crop.width}</Text>
                                  </GridItem>
                                  <GridItem
                                    p={1}
                                    borderBottom={
                                      i < image.cropHistory.length - 1
                                        ? '1px'
                                        : '0'
                                    }
                                    borderColor="gray.600"
                                  >
                                    <Text textAlign="right">
                                      {crop.height}
                                    </Text>
                                  </GridItem>
                                </React.Fragment>
                              ))}
                            </Grid>
                          </Box>
                        )}
                      </VStack>
                    </PopoverBody>
                  </PopoverContent>
                </Popover>
                <IconButton
                  aria-label="Delete"
                  icon={<DeleteIcon boxSize={3.5} />}
                  bg="red.500"
                  color="white"
                  opacity={0.9}
                  boxShadow="0 0 4px rgba(0,0,0,0.3)"
                  _hover={{ bg: 'red.600', opacity: 1 }}
                  height="28px"
                  width="28px"
                  minWidth="28px"
                  padding={0}
                  position="absolute"
                  top={0}
                  right={0}
                  onClick={() => handleDelete(image.id)}
                />
              </Box>
              <Button
                mt={2}
                w="full"
                height="28px"
                minHeight="28px"
                maxHeight="28px"
                size="none"
                padding="0 16px"
                onClick={() => openCropModal(image)}
                bg={colorMode === 'light' ? '#C9CCD2' : 'gray.600'}
                _hover={{ bg: colorMode === 'light' ? '#D4D9E0' : 'gray.500' }}
                _active={{
                  bg: colorMode === 'light' ? '#ABAFB6' : 'gray.700'
                }}
              >
                {TEXT.BUTTONS.CROP}
              </Button>
            </Box>
          ))}
        </Grid>
      </VStack>
      <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
        <ModalOverlay />
        <ModalContent
          maxH="100vh"
          my={0}
          display="flex"
          flexDirection="column"
        >
          <ModalBody
            display="flex"
            flexDirection="column"
            gap={3}
            px={6}
            py={6}
          >
            {currentImage && (
              <>
                <Cropper
                  src={currentImage.url}
                  style={{ height: 'min(50vh, 400px)', width: '100%' }}
                  initialAspectRatio={activeCropSettings.aspectRatio}
                  data={initialCropSettings || activeCropSettings}  // Fallback to activeCropSettings if initialCropSettings is null
                  guides={true}
                  crop={handleCropEvent}
                  ready={handleCropperReady}
                  ref={cropperRef}
                  viewMode={1}
                  dragMode="move"
                  cropBoxMovable={true}
                  cropBoxResizable={true}
                  toggleDragModeOnDblclick={false}
                  autoCropArea={1}
                />
                <VStack spacing={2} w="full">
                  <Flex
                    w="full"
                    direction={{ base: 'column', md: 'row' }}
                    gap={2}
                    align={{ base: 'center', md: 'center' }}
                    justify={{ base: 'center', md: 'space-between' }}
                  >
                    <HStack
                      spacing={12}
                      flex={{ base: '0 0 auto', md: 'none' }}
                      alignItems="baseline"
                    >
                      <Text
                        fontWeight="bold"
                        fontSize="md"
                        lineHeight="32px"
                        mt="-1px"
                      >
                        {TEXT.MODAL.TITLE}
                      </Text>
                      <FormControl display="flex" alignItems="center" w="auto">
                        <FormLabel
                          fontSize="sm"
                          lineHeight="32px"
                          mb={0}
                          mr={2}
                          whiteSpace="nowrap"
                        >
                          {TEXT.MODAL.ORIGINAL_LABEL}
                        </FormLabel>
                        <Text fontSize="sm" lineHeight="32px">
                          {originalDimensions
                            ? `${originalDimensions.width} x ${originalDimensions.height}px`
                            : ''}
                        </Text>
                      </FormControl>
                    </HStack>
                    <FormControl
                      w={{ base: 'auto', md: '200px' }}
                      display="flex"
                      alignItems="center"
                      justifyContent={{ base: 'center', md: 'flex-start' }}
                    >
                      <FormLabel
                        fontSize="sm"
                        lineHeight="32px"
                        mb={0}
                        mr={2}
                        whiteSpace="nowrap"
                      >
                        {TEXT.MODAL.ASPECT_RATIO_LABEL}
                      </FormLabel>
                      <Select
                        size="sm"
                        value={selectedAspectRatio}
                        onChange={handleAspectChange}
                        h="32px"
                        w="120px"
                      >
                        <option value={TEXT.MODAL.ASPECT_RATIOS.FREE.VALUE}>
                          {TEXT.MODAL.ASPECT_RATIOS.FREE.LABEL}
                        </option>
                        <option
                          value={TEXT.MODAL.ASPECT_RATIOS.ORIGINAL.VALUE}
                        >
                          {TEXT.MODAL.ASPECT_RATIOS.ORIGINAL.LABEL}
                        </option>
                        <option value={TEXT.MODAL.ASPECT_RATIOS.SQUARE.VALUE}>
                          {TEXT.MODAL.ASPECT_RATIOS.SQUARE.LABEL}
                        </option>
                      </Select>
                    </FormControl>
                  </Flex>
                  <Flex
                    w="full"
                    direction={{ base: 'column', sm: 'row' }}
                    gap={4}
                    align={{ base: 'center', sm: 'center' }}
                  >
                    <HStack
                      spacing={4}
                      flex="1"
                      justify={{ base: 'center', sm: 'flex-start' }}
                    >
                      <FormControl display="flex" alignItems="center" w="auto">
                        <FormLabel
                          fontSize="sm"
                          lineHeight="32px"
                          mb={0}
                          mr={2}
                          whiteSpace="nowrap"
                        >
                          X:
                        </FormLabel>
                        <Input
                          {...inputProps('x')}
                          value={formatNumber(activeCropSettings.x)}
                          min={0}
                          max={
                            originalDimensions
                              ? originalDimensions.width - activeCropSettings.width
                              : CROP_SIZE.MAX - CROP_SIZE.MIN
                          }
                        />
                      </FormControl>
                      <FormControl display="flex" alignItems="center" w="auto">
                        <FormLabel
                          fontSize="sm"
                          lineHeight="32px"
                          mb={0}
                          mr={2}
                          whiteSpace="nowrap"
                        >
                          Y:
                        </FormLabel>
                        <Input
                          {...inputProps('y')}
                          value={formatNumber(activeCropSettings.y)}
                          min={0}
                          max={
                            originalDimensions
                              ? originalDimensions.height - activeCropSettings.height
                              : CROP_SIZE.MAX - CROP_SIZE.MIN
                          }
                        />
                      </FormControl>
                    </HStack>
                    <HStack
                      spacing={4}
                      flex="1"
                      justify={{ base: 'center', sm: 'flex-start' }}
                    >
                      <FormControl display="flex" alignItems="center" w="auto">
                        <FormLabel
                          fontSize="sm"
                          lineHeight="32px"
                          mb={0}
                          mr={2}
                          whiteSpace="nowrap"
                        >
                          Width:
                        </FormLabel>
                        <Input
                          {...inputProps('width')}
                          value={formatNumber(activeCropSettings.width)}
                          min={CROP_SIZE.MIN}
                          max={
                            originalDimensions
                              ? originalDimensions.width - activeCropSettings.x
                              : CROP_SIZE.MAX
                          }
                        />
                      </FormControl>
                      <FormControl display="flex" alignItems="center" w="auto">
                        <FormLabel
                          fontSize="sm"
                          lineHeight="32px"
                          mb={0}
                          mr={2}
                          whiteSpace="nowrap"
                        >
                          Height:
                        </FormLabel>
                        <Input
                          {...inputProps('height')}
                          value={formatNumber(activeCropSettings.height)}
                          min={CROP_SIZE.MIN}
                          max={
                            originalDimensions
                              ? originalDimensions.height - activeCropSettings.y
                              : CROP_SIZE.MAX
                          }
                        />
                      </FormControl>
                    </HStack>
                  </Flex>
                  <Grid
                    w="full"
                    mt={3}
                    templateColumns="1.5fr 3fr"
                    alignItems="center"
                  >
                    <GridItem>
                      <Checkbox
                        size="sm"
                        isChecked={saveOnCancel}
                        onChange={(e) => setSaveOnCancel(e.target.checked)}
                      >
                        {TEXT.MODAL.SAVE_ON_CANCEL}
                      </Checkbox>
                    </GridItem>
                    <GridItem>
                      <HStack>
                        <Button size="sm" onClick={handleCancel}>
                          {TEXT.BUTTONS.CANCEL}
                        </Button>
                        <Button
                          size="sm"
                          colorScheme="blue"
                          onClick={handleCrop}
                        >
                          {TEXT.BUTTONS.CROP_DOWNLOAD}
                        </Button>
                      </HStack>
                    </GridItem>
                  </Grid>
                </VStack>
              </>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
};

const App: React.FC = () => {
  return (
    <ChakraProvider theme={theme}>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <ImageCropperApp />
    </ChakraProvider>
  );
};

export default App;
