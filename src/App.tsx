// App.tsx
import React, { useState, useCallback, useRef, useEffect, useMemo, Fragment } from 'react';
// prettier-ignore
import {
  ChakraProvider, Box, Button, Flex, Grid, GridItem, Image, Modal, ModalOverlay,
  ModalContent, ModalBody, Text, IconButton, useDisclosure, Select, Input,
  VStack, HStack, useToast, extendTheme, ColorModeScript, Switch, FormControl,
  FormLabel, useColorMode, Popover, PopoverTrigger, PopoverContent, PopoverBody,
  PopoverArrow, Spinner, Checkbox, UseToastOptions, BoxProps, TextProps
} from '@chakra-ui/react';
import { DeleteIcon, InfoIcon } from '@chakra-ui/icons';
import Cropper, { ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import './cropper-custom.css';

interface CropDimensions {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropSettings extends CropDimensions {
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
  cropHistory: CropDimensions[];
  cropSettings?: CropSettings;
  canvasData?: Cropper.CanvasData;
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

const ACCEPTED_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp']
};

const IMAGE_SIZE = {
  MIN: 16,
  MAX: 10000
};

const CROP_SIZE = {
  MIN: 1,
  MAX: 9999
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const TIMING = {
  DEBOUNCE: 50,
  FADE_OUT: 200,
  TOAST_DELAY: 300,
  TRANSITION: '0.2s'
};

const COLORS = {
  DARK_TEXT: '#1A202C',
  WARNING_BG: '#E5C16D'
} as const;

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
  REFRESH: 'If images fail to load, please refresh the page.',
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
          `${count} ${pluralize('image', count)} ignored because of limit`,
        PARTIAL: (added: number, ignored: number) =>
          `${pluralize('First image', `First ${added} images`, added)} added, ` +
          `${ignored} ${pluralize('image was', 'images were', ignored)} ignored due to limit.`
      }
    },
    DUPLICATES: {
      TITLE: 'Duplicates detected',
      DESC: (count: number) => `${count} duplicate ${pluralize('file', count)} ignored`
    },
    INVALID_TYPE: {
      TITLE: 'Invalid files',
      DESC: (count: number) => {
        const acceptedTypes = Object.values(ACCEPTED_TYPES).flat().join(', ');
        return `${count} ${pluralize('file', count)} ignored (only ${acceptedTypes} files are accepted)`;
      }
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
    INVALID_DIMENSIONS: {
      TITLE: 'Invalid image dimensions',
      DESC: (count: number) =>
        `${count} ${pluralize('image is', 'images are', count)} are not between\n` +
        `${IMAGE_SIZE.MIN}px and ${IMAGE_SIZE.MAX}px in either direction`
    },
    INVALID_IMAGES: {
      TITLE: 'Invalid images',
      DESC: (count: number) =>
        `${count} ${pluralize('image was', 'images were', count)} invalid or corrupted`
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
            color: COLORS.DARK_TEXT,
            bg: COLORS.WARNING_BG,
            _light: {
              bg: COLORS.WARNING_BG
            },
            _dark: {
              bg: COLORS.WARNING_BG
            }
          },
          icon: {
            color: COLORS.DARK_TEXT
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

const pluralize = (singular: string, plural?: string | number, count: number = 1) => {
  if (typeof plural === 'number') {
    count = plural;
    plural = undefined;
  }
  if (count === 1) return singular;
  return typeof plural === 'string' ? plural : `${singular}s`;
};

const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const getFileExtension = (filename: string): string => {
  return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
};

const formatNumber = (num: number): string => {
  const rounded = Math.round(num);
  return rounded === 0 ? '0' : rounded.toString();
};

const convertToDisplaySize = (
  actualSize: number,
  originalSize: number,
  displaySize: number
): number => {
  return Math.round((actualSize / originalSize) * displaySize);
};

const convertToActualSize = (
  displaySize: number,
  originalSize: number,
  containerSize: number
): number => {
  return Math.round((displaySize / containerSize) * originalSize);
};

// Displays a filename with intelligent truncation
// Maintains file extension
// Truncates from the middle
// Alternates between removing characters from left and right
// Optionally shows full filename in a popover
const TruncatedFileName: React.FC<{
  filename: string;
  isOpen?: boolean;
  onToggle?: () => void;
  showPopover?: boolean;
  boxProps?: BoxProps;
  textProps?: TextProps;
}> = ({
  filename,
  isOpen = false,
  onToggle = () => {},
  showPopover = true,
  boxProps = {},
  textProps = {}
}) => {
  const measureRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayText, setDisplayText] = useState(filename);

  const updateTruncation = useCallback(() => {
    if (measureRef.current && containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;

      const getTextWidth = (text: string) => {
        measureRef.current!.textContent = text;
        return measureRef.current!.offsetWidth;
      };

      let currentText = filename;
      let currentWidth = getTextWidth(currentText);

      if (currentWidth <= containerWidth) {
        setDisplayText(currentText);
        return;
      }

      const lastDotIndex = currentText.lastIndexOf('.');
      const extension = lastDotIndex !== -1 ? currentText.slice(lastDotIndex) : '';
      const nameWithoutExt = lastDotIndex !== -1 ? currentText.slice(0, lastDotIndex) : currentText;

      let leftIndex = Math.floor(nameWithoutExt.length / 2);
      let rightIndex = Math.ceil(nameWithoutExt.length / 2);
      let removeFromRight = true;

      let leftPart = nameWithoutExt.slice(0, leftIndex);
      let rightPart = nameWithoutExt.slice(rightIndex);

      while (getTextWidth(`${leftPart}...${rightPart}${extension}`) > containerWidth) {
        if (removeFromRight && rightPart.length > 0) {
          rightPart = rightPart.slice(0, -1);
        } else if (!removeFromRight && leftPart.length > 0) {
          leftPart = leftPart.slice(0, -1);
        } else if (rightPart.length > 0) {
          rightPart = rightPart.slice(0, -1);
        } else if (leftPart.length > 0) {
          leftPart = leftPart.slice(0, -1);
        } else {
          if (extension) {
            setDisplayText(`...${extension}`);
          } else {
            setDisplayText('...');
          }
          return;
        }

        removeFromRight = !removeFromRight;
      }

      if (leftPart || rightPart) {
        setDisplayText(`${leftPart}...${rightPart}${extension}`);
      } else {
        setDisplayText(`...${extension}`);
      }
    }
  }, [filename]);

  useEffect(() => {
    updateTruncation();
  }, [filename, updateTruncation]);

  useEffect(() => {
    const handleResize = debounce(() => {
      updateTruncation();
    }, 100);

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updateTruncation]);

  const isTruncated = displayText !== filename;

  const content = (
    <Box ref={containerRef} position="relative" w="full" {...boxProps}>
      <Text
        color="gray.400"
        w="full"
        mb={1}
        cursor={isTruncated && showPopover ? 'pointer' : 'default'}
        textAlign="center"
        noOfLines={1}
        _focus={{ outline: 'none' }}
        onClick={isTruncated && showPopover ? onToggle : undefined}
        {...textProps}
      >
        {displayText}
      </Text>
      <span
        ref={measureRef}
        style={{
          position: 'absolute',
          visibility: 'hidden',
          whiteSpace: 'nowrap',
          fontSize: textProps.fontSize === 'xs' ? '12px' : '14px'
        }}
      >
        {filename}
      </span>
    </Box>
  );

  if (!showPopover) {
    return content;
  }

  return (
    <Popover
      placement="bottom"
      isOpen={isOpen && isTruncated}
      strategy="fixed"
      modifiers={[
        {
          name: 'preventOverflow',
          options: {
            altAxis: true,
            padding: 8
          }
        }
      ]}
    >
      <PopoverTrigger>{content}</PopoverTrigger>
      <PopoverContent p={2} width="auto">
        <PopoverBody>
          <Text {...textProps}>{filename}</Text>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

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
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<ReactCropperElement>(null);
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectUrlsToCleanup = useRef<string[]>([]);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { colorMode, toggleColorMode } = useColorMode();
  const toast = useToast({
    position: 'bottom',
    duration: 6000,
    isClosable: true,
    variant: 'solid',
    status: 'warning'
  });

  const existingFilenames = useMemo(() => new Set(images.map((img) => img.file.name)), [images]);

  const createToastMessage = useCallback(
    (
      type:
        | 'limit'
        | 'duplicate'
        | 'invalid-type'
        | 'file-size'
        | 'mime-mismatch'
        | 'invalid-dimensions'
        | 'invalid-image'
        | 'load-error',
      params?: {
        count?: number;
        filename?: string;
        mimeType?: string;
        added?: number;
        ignored?: number;
        minSize?: number;
        maxSize?: number;
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

        case 'invalid-dimensions':
          message.title = TEXT.TOASTS.INVALID_DIMENSIONS.TITLE;
          message.description = TEXT.TOASTS.INVALID_DIMENSIONS.DESC(params?.count || 0);
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

  const addUrlForCleanup = (url: string) => {
    objectUrlsToCleanup.current.push(url);
  };

  const removeUrlFromCleanup = (url: string) => {
    objectUrlsToCleanup.current = objectUrlsToCleanup.current.filter((u) => u !== url);
  };

  const getAspectRatioFromSelection = useCallback(
    (value: string): number => {
      switch (value) {
        case TEXT.MODAL.ASPECT_RATIOS.ORIGINAL.VALUE:
          return originalDimensions ? originalDimensions.width / originalDimensions.height : 0;
        case TEXT.MODAL.ASPECT_RATIOS.SQUARE.VALUE:
          return 1;
        default:
          return 0;
      }
    },
    [originalDimensions]
  );

  const getSelectionFromAspectRatio = (
    ratio: number,
    originalDimensions: { width: number; height: number } | null
  ): string => {
    if (ratio === 1) {
      return TEXT.MODAL.ASPECT_RATIOS.SQUARE.VALUE;
    } else if (
      originalDimensions &&
      Math.abs(ratio - originalDimensions.width / originalDimensions.height) < 0.0001
    ) {
      return TEXT.MODAL.ASPECT_RATIOS.ORIGINAL.VALUE;
    }
    return TEXT.MODAL.ASPECT_RATIOS.FREE.VALUE;
  };

  const updateCropSettings = useCallback(
    (data: Cropper.Data) => {
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
            img.id === currentImage.id ? { ...img, cropSettings: newCropSettings } : img
          )
        );
      } else {
        setGlobalCropSettings(newCropSettings);
      }
    },
    [currentImage, isPerImageCrop]
  );

  const validateImage = useCallback(
    (file: File): Promise<{ isValid: boolean; error?: 'too_small' | 'too_large' | 'corrupt' }> => {
      return new Promise((resolve) => {
        try {
          const img = new window.Image();
          const objectUrl = URL.createObjectURL(file);
          addUrlForCleanup(objectUrl);
          const timeout = setTimeout(() => {
            URL.revokeObjectURL(objectUrl);
            removeUrlFromCleanup(objectUrl);
            resolve({ isValid: false, error: 'corrupt' });
          }, 10000);

          img.onload = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(objectUrl);
            removeUrlFromCleanup(objectUrl);

            if (img.width < IMAGE_SIZE.MIN || img.height < IMAGE_SIZE.MIN) {
              resolve({ isValid: false, error: 'too_small' });
              return;
            }
            if (img.width > IMAGE_SIZE.MAX || img.height > IMAGE_SIZE.MAX) {
              resolve({ isValid: false, error: 'too_large' });
              return;
            }

            // Test image integrity by attempting to draw and read a 1x1 sample
            try {
              const canvas = document.createElement('canvas');
              canvas.width = Math.min(img.width, 1);
              canvas.height = Math.min(img.height, 1);
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                resolve({ isValid: false, error: 'corrupt' });
                return;
              }

              ctx.drawImage(img, 0, 0, 1, 1);
              ctx.getImageData(0, 0, 1, 1);

              resolve({ isValid: true });
            } catch (error) {
              console.error('Image validation failed:', error);
              resolve({ isValid: false, error: 'corrupt' });
            }
          };

          img.onerror = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(objectUrl);
            removeUrlFromCleanup(objectUrl);
            resolve({ isValid: false, error: 'corrupt' });
          };

          img.src = objectUrl;
        } catch (error) {
          console.warn('Image validation failed:', error);
          resolve({ isValid: false, error: 'corrupt' });
        }
      });
    },
    []
  );

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
          setTimeout(() => messages.forEach((msg) => toast(msg)), TIMING.TOAST_DELAY);
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
            messages.push(
              createToastMessage('mime-mismatch', { filename: f.name, mimeType: f.type })
            );
            return false;
          }

          return true;
        });
        const invalidTypeCount = files.length - imageFiles.length;

        if (invalidTypeCount > 0) {
          messages.push(createToastMessage('invalid-type', { count: invalidTypeCount }));
          if (imageFiles.length === 0) {
            setTimeout(() => setIsProcessing(false), TIMING.FADE_OUT);
            setTimeout(() => messages.forEach((msg) => toast(msg)), TIMING.TOAST_DELAY);
            return;
          }
        }

        // Filter duplicates
        const nonDuplicateFiles = imageFiles.filter((file) => !existingFilenames.has(file.name));
        const duplicateCount = imageFiles.length - nonDuplicateFiles.length;

        if (duplicateCount > 0) {
          messages.push(createToastMessage('duplicate', { count: duplicateCount }));
          if (nonDuplicateFiles.length === 0) {
            setTimeout(() => setIsProcessing(false), TIMING.FADE_OUT);
            setTimeout(() => messages.forEach((msg) => toast(msg)), TIMING.TOAST_DELAY);
            return;
          }
        }

        // Process files: validate images, create object URLs, and update state
        const filesToProcess = nonDuplicateFiles.slice(0, remainingSlots);
        const ignoredDueToLimit = Math.max(0, nonDuplicateFiles.length - remainingSlots);
        let invalidSizeCount = 0;
        let invalidImageCount = 0;

        if (filesToProcess.length === 0) {
          if (ignoredDueToLimit > 0) {
            messages.push(
              createToastMessage('limit', {
                added: filesToProcess.length,
                ignored: ignoredDueToLimit
              })
            );
          }
          setTimeout(() => setIsProcessing(false), TIMING.FADE_OUT);
          setTimeout(() => messages.forEach((msg) => toast(msg)), TIMING.TOAST_DELAY);
          return;
        }

        for (const file of filesToProcess) {
          try {
            const validation = await validateImage(file);
            if (validation.isValid) {
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
              if (validation.error === 'too_small' || validation.error === 'too_large') {
                invalidSizeCount++;
              } else {
                invalidImageCount++;
              }
            }
          } catch (error) {
            console.error('Error processing image:', error);
            invalidImageCount++;
          }
        }

        if (invalidSizeCount > 0) {
          messages.push(createToastMessage('invalid-dimensions', { count: invalidSizeCount }));
        }
        if (invalidImageCount > 0) {
          messages.push(createToastMessage('invalid-image', { count: invalidImageCount }));
        }

        if (ignoredDueToLimit > 0) {
          messages.push(
            createToastMessage('limit', {
              added: filesToProcess.length - invalidImageCount,
              ignored: ignoredDueToLimit
            })
          );
        }

        setTimeout(() => setIsProcessing(false), TIMING.FADE_OUT);
        setTimeout(() => messages.forEach((msg) => toast(msg)), TIMING.TOAST_DELAY);
      }, TIMING.DEBOUNCE);
    },
    [images, toast, isProcessing, validateImage, existingFilenames, createToastMessage]
  );

  const handleFileInputClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePageClick = useCallback(() => {
    toast.closeAll();
  }, [toast]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      processFiles(files);
    },
    [processFiles]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);
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

  const handleCropMemoryChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setIsPerImageCrop(e.target.value === 'per-image');
  }, []);

  // Handles numeric input changes for crop box dimensions
  // If isComplete is false, only updates the input value
  // If isComplete is true, validates and applies the change to the cropper
  const handleNumericChange = useCallback(
    (key: keyof CropSettings, value: string, isComplete: boolean) => {
      const cropper = cropperRef.current?.cropper;
      if (!cropper) return;

      let num = Math.min(Number(value), CROP_SIZE.MAX);

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
      const containerData = cropper.getContainerData();

      // Convert the input value to actual image dimensions
      if (['width', 'height'].includes(key)) {
        num = convertToActualSize(
          num,
          key === 'width' ? imageWidth : imageHeight,
          key === 'width' ? containerData.width : containerData.height
        );
      }

      const newData = { ...currentData };

      switch (key) {
        case 'x':
          newData.x = Math.max(0, Math.min(imageWidth - currentData.width, num));
          break;
        case 'y':
          newData.y = Math.max(0, Math.min(imageHeight - currentData.height, num));
          break;
        case 'width':
          newData.width = Math.max(1, Math.min(imageWidth - currentData.x, num));
          break;
        case 'height':
          newData.height = Math.max(1, Math.min(imageHeight - currentData.y, num));
          break;
      }

      cropper.setData(newData);

      // Get the final data and convert back to display dimensions for the inputs
      const finalData = cropper.getData();
      const displayData = {
        ...finalData,
        width: convertToDisplaySize(finalData.width, imageWidth, containerData.width),
        height: convertToDisplaySize(finalData.height, imageHeight, containerData.height)
      };

      setActiveCropSettings({
        x: Math.round(displayData.x),
        y: Math.round(displayData.y),
        width: Math.round(displayData.width),
        height: Math.round(displayData.height),
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

  // Handles crop box changes and enforces minimum dimensions
  const handleCropEvent = useCallback(
    (e: Cropper.CropEvent) => {
      if (isClosing) return;
      const cropper = cropperRef.current?.cropper;
      if (!cropper) return;

      let data = cropper.getData();

      if (data.width < CROP_SIZE.MIN || data.height < CROP_SIZE.MIN) {
        const newData = {
          ...data,
          width: Math.max(data.width, CROP_SIZE.MIN),
          height: Math.max(data.height, CROP_SIZE.MIN)
        };
        cropper.setData(newData);
        data = newData;
      }

      updateCropSettings(data);
    },
    [isClosing, updateCropSettings]
  );

  // Initializes the cropper with saved or default settings
  // Called after the cropper component is mounted and ready
  const handleCropperReady = useCallback(() => {
    if (isClosing) return;

    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;

    if (initialCropSettings) {
      requestAnimationFrame(() => {
        const aspectRatio = getAspectRatioFromSelection(selectedAspectRatio);
        cropper.setAspectRatio(aspectRatio);

        if (currentImage?.canvasData) {
          cropper.setCanvasData(currentImage.canvasData);
        }

        cropper.setData(initialCropSettings);
        const data = cropper.getData();
        updateCropSettings(data);
      });
    }
  }, [
    initialCropSettings,
    isClosing,
    updateCropSettings,
    getAspectRatioFromSelection,
    selectedAspectRatio,
    currentImage
  ]);

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
        height: aspectRatio ? currentData.width / aspectRatio : currentData.height,
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
            img.id === currentImage.id ? { ...img, cropSettings: newCropSettings } : img
          )
        );
      } else {
        setGlobalCropSettings(newCropSettings);
      }
    }
  };

  // Opens crop modal with settings based on mode:
  // Per-Image: image settings -> default
  // Global: global settings -> default
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
        : globalCropSettings || defaultSettings;

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

  // Handles crop & save operation using modern File System API if available
  const handleCrop = async () => {
    const cropper = cropperRef.current?.cropper;
    if (cropper && currentImage) {
      const canvas = cropper.getCroppedCanvas();
      let blob: Blob | null = null;
      try {
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
        if (!blob) return;

        const croppedFile = new File([blob], `cropped-${currentImage.file.name}`, {
          type: blob.type
        });
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
            const canvasData = cropper.getCanvasData();
            setImages((prev) =>
              prev.map((img) =>
                img.id === currentImage.id
                  ? {
                      ...img,
                      cropped: true,
                      cropSettings: newCropSettings,
                      canvasData: canvasData,
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
      const currentCanvasData = cropper.getCanvasData();

      if (saveOnCancel) {
        const aspectRatio = getAspectRatioFromSelection(selectedAspectRatio);
        const newCropSettings: CropSettings = {
          x: currentData.x,
          y: currentData.y,
          width: currentData.width,
          height: currentData.height,
          aspectRatio
        };

        if (isPerImageCrop) {
          setImages((prev) =>
            prev.map((img) =>
              img.id === currentImage.id
                ? {
                    ...img,
                    cropSettings: newCropSettings,
                    canvasData: currentCanvasData
                  }
                : img
            )
          );
        } else {
          setGlobalCropSettings(newCropSettings);
        }
      } else if (isPerImageCrop) {
        setImages((prev) =>
          prev.map((img) =>
            img.id === currentImage.id
              ? {
                  ...img,
                  cropSettings: undefined,
                  canvasData: undefined
                }
              : img
          )
        );
      }

      if (!saveOnCancel) {
        setSaveOnCancel(false);
        setSelectedAspectRatio('free');
      }

      cropper.destroy();
    }
    onClose();
  };

  const inputProps = useCallback(
    (key: keyof CropSettings) => ({
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
    }),
    [handleXChange, handleYChange, handleWidthChange, handleHeightChange, handleNumericChange]
  );

  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      objectUrlsToCleanup.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      objectUrlsToCleanup.current = [];
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
      w="full"
      display="flex"
      flexDirection="column"
      h="100vh"
      overflow="auto"
      p={4}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={handlePageClick}
    >
      <Box flex="1">
        <VStack spacing={4} align="stretch" position="relative">
          <Flex gap={6} flexWrap="wrap" alignItems="center" justifyContent="flex-end" minH="32px">
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
            <FormControl display="flex" alignItems="center" w="auto" minW="max-content" h="32px">
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
            <FormControl display="flex" alignItems="center" w="auto" minW="max-content" h="32px">
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
                <option value="per-image">{TEXT.CROP_MEMORY.OPTIONS.PER_IMAGE}</option>
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
            {images
              .sort((a, b) => a.file.name.localeCompare(b.file.name))
              .map((image) => (
                <Box
                  key={image.id}
                  borderWidth="1px"
                  borderRadius="md"
                  p={2}
                  position="relative"
                  display="flex"
                  flexDirection="column"
                  height="230px"
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
                                  <GridItem p={1} borderBottom="1px" borderColor="gray.600">
                                    <Text fontWeight="medium" textAlign="center">
                                      {TEXT.CROP_HISTORY.COLUMNS.HEIGHT}
                                    </Text>
                                  </GridItem>
                                  {image.cropHistory.map((crop, i) => (
                                    <Fragment key={i}>
                                      <GridItem
                                        p={1}
                                        borderRight="1px"
                                        borderBottom={
                                          i < image.cropHistory.length - 1 ? '1px' : '0'
                                        }
                                        borderColor="gray.600"
                                      >
                                        <Text textAlign="right">{crop.x}</Text>
                                      </GridItem>
                                      <GridItem
                                        p={1}
                                        borderRight="1px"
                                        borderBottom={
                                          i < image.cropHistory.length - 1 ? '1px' : '0'
                                        }
                                        borderColor="gray.600"
                                      >
                                        <Text textAlign="right">{crop.y}</Text>
                                      </GridItem>
                                      <GridItem
                                        p={1}
                                        borderRight="1px"
                                        borderBottom={
                                          i < image.cropHistory.length - 1 ? '1px' : '0'
                                        }
                                        borderColor="gray.600"
                                      >
                                        <Text textAlign="right">{crop.width}</Text>
                                      </GridItem>
                                      <GridItem
                                        p={1}
                                        borderBottom={
                                          i < image.cropHistory.length - 1 ? '1px' : '0'
                                        }
                                        borderColor="gray.600"
                                      >
                                        <Text textAlign="right">{crop.height}</Text>
                                      </GridItem>
                                    </Fragment>
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
                  <TruncatedFileName
                    filename={image.file.name}
                    isOpen={openPopoverId === image.id}
                    onToggle={() => setOpenPopoverId(openPopoverId === image.id ? null : image.id)}
                    boxProps={{ pt: 2, pb: 3 }}
                    textProps={{
                      fontSize: 'xs'
                    }}
                  />
                  <Button
                    mt={0}
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
                    <Text fontSize="md" lineHeight="26px" mt={-1}>
                      {TEXT.BUTTONS.CROP}
                    </Text>
                  </Button>
                </Box>
              ))}
          </Grid>
        </VStack>
        <Modal isOpen={isOpen} onClose={onClose} size="xl">
          <ModalOverlay />
          <ModalContent display="flex" flexDirection="column" overflow="hidden" m="auto">
            <ModalBody
              display="flex"
              flexDirection="column"
              gap={3}
              p={6}
              overflow="visible"
              flex="1 1 auto"
              minH={0}
            >
              {currentImage && (
                <>
                  <Box
                    className="gip-cropper-container"
                    mx="auto" // Center horizontally
                    style={{
                      aspectRatio: originalDimensions
                        ? `${originalDimensions.width} / ${originalDimensions.height}`
                        : undefined,
                      width: originalDimensions
                        ? (() => {
                            const targetHeightPortrait = 450;
                            const targetWidthLandscape = 450;
                            const aspectRatio =
                              originalDimensions.width / originalDimensions.height;
                            if (aspectRatio < 1) {
                              // Portrait: use target height directly
                              return `${targetHeightPortrait * aspectRatio}px`;
                            } else {
                              // Landscape: calculate width to maintain aspect ratio
                              return `${targetWidthLandscape * aspectRatio}px`;
                            }
                          })()
                        : '100%',
                      maxWidth: '100%'
                    }}
                  >
                    <Cropper
                      src={currentImage.url}
                      style={{ height: '100%', width: '100%' }}
                      minContainerWidth={IMAGE_SIZE.MIN}
                      minContainerHeight={IMAGE_SIZE.MIN}
                      minCropBoxWidth={CROP_SIZE.MIN}
                      minCropBoxHeight={CROP_SIZE.MIN}
                      initialAspectRatio={activeCropSettings.aspectRatio}
                      data={initialCropSettings || activeCropSettings}
                      guides={true}
                      crop={handleCropEvent}
                      ready={handleCropperReady}
                      ref={cropperRef}
                      viewMode={1}
                      dragMode="move"
                      restore={true}
                      cropBoxMovable={true}
                      cropBoxResizable={true}
                      scalable={true}
                      zoomable={true}
                      movable={true}
                      background={true}
                      modal={true}
                      highlight={true}
                      center={true}
                      toggleDragModeOnDblclick={false}
                      responsive={true}
                      checkOrientation={true}
                    />
                  </Box>
                  <VStack spacing={0} w="full">
                    <Text
                      fontSize="sm"
                      color="gray.400"
                      textAlign="center"
                      w="full"
                      noOfLines={1}
                      title={currentImage?.file.name}
                      p={0}
                      m={-1}
                    >
                      <TruncatedFileName
                        filename={currentImage.file.name}
                        isOpen={openPopoverId === currentImage.id}
                        onToggle={() =>
                          setOpenPopoverId(
                            openPopoverId === currentImage.id ? null : currentImage?.id
                          )
                        }
                        boxProps={{ p: 0, mt: -1 }}
                        textProps={{
                          fontSize: 'sm'
                        }}
                      />
                    </Text>
                    <Flex
                      w="full"
                      direction={{ base: 'column', md: 'row' }}
                      align={{ base: 'center', md: 'center' }}
                      justify="space-between"
                      gap={2}
                      mt={2}
                    >
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
                        <Text fontSize="sm" lineHeight="32px" whiteSpace="nowrap">
                          {originalDimensions
                            ? `${originalDimensions.width} x ${originalDimensions.height}px`
                            : ''}
                        </Text>
                      </FormControl>
                      <FormControl display="flex" alignItems="center" w="auto">
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
                          <option value={TEXT.MODAL.ASPECT_RATIOS.ORIGINAL.VALUE}>
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
                      direction={{ base: 'column', md: 'row' }}
                      align={{ base: 'center', md: 'center' }}
                      gap={4}
                      mt={4}
                    >
                      <HStack spacing={4} flex="1" justify={{ base: 'center', sm: 'flex-start' }}>
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
                      <HStack spacing={4} flex="1" justify={{ base: 'center', sm: 'flex-start' }}>
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
                    <Grid w="full" mt={5} templateColumns="1.5fr 3fr" alignItems="center">
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
                          <Button size="sm" colorScheme="blue" onClick={handleCrop}>
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
      <Text fontSize="sm" color="gray.500" textAlign="center" mt={6}>
        {TEXT.REFRESH}
      </Text>
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
