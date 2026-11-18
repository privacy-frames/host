// Generated runtime projection of the pinned @webref/idl corpus.
// @webref/idl 3.87.0; webidl2 24.5.0; source 00c7327b9a529b32a491d516babcde1025f7d0aa0edffc983f444859bf16b29e.
// Detailed conversion schemas remain in generated-interfaces.ts for build/reference use.
import type { RuntimeInterfaceDefinition } from './interface-definitions.ts';

// prettier-ignore
export const runtimeInterfaces: readonly RuntimeInterfaceDefinition[] = [
  {
    "name": "AbortController",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AbortSignal",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AbsoluteOrientationSensor",
    "kind": "interface",
    "parent": "OrientationSensor",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AbstractRange",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Accelerometer",
    "kind": "interface",
    "parent": "Sensor",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Alarms",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AmbientLightSensor",
    "kind": "interface",
    "parent": "Sensor",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AnalyserNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ANGLE_instanced_arrays",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "Animation",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AnimationEffect",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AnimationEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AnimationNodeList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AnimationPlaybackEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AnimationTimeline",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AnimationTrigger",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AnimationWorkletGlobalScope",
    "kind": "interface",
    "parent": "WorkletGlobalScope",
    "exposed": [
      "AnimationWorklet"
    ],
    "global": [
      "Worklet",
      "AnimationWorklet"
    ],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": [
      {
        "name": "registerAnimator",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      }
    ]
  },
  {
    "name": "Attr",
    "kind": "interface",
    "parent": "Node",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Attribution",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AttributionAggregationServices",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioBuffer",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AudioBufferSourceNode",
    "kind": "interface",
    "parent": "AudioScheduledSourceNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AudioContext",
    "kind": "interface",
    "parent": "BaseAudioContext",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AudioData",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AudioDecoder",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AudioDestinationNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioEncoder",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AudioListener",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioNode",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioParam",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioParamMap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioPlaybackStats",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioProcessingEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AudioScheduledSourceNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioSession",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioSinkInfo",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioTrack",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioTrackList",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioWorklet",
    "kind": "interface",
    "parent": "Worklet",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AudioWorkletGlobalScope",
    "kind": "interface",
    "parent": "WorkletGlobalScope",
    "exposed": [
      "AudioWorklet"
    ],
    "global": [
      "Worklet",
      "AudioWorklet"
    ],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": [
      {
        "name": "registerProcessor",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "currentFrame",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "currentTime",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "sampleRate",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "renderQuantumSize",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "port",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "performance",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      }
    ]
  },
  {
    "name": "AudioWorkletNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AudioWorkletProcessor",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "AudioWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "AuthenticatorAssertionResponse",
    "kind": "interface",
    "parent": "AuthenticatorResponse",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AuthenticatorAttestationResponse",
    "kind": "interface",
    "parent": "AuthenticatorResponse",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AuthenticatorResponse",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "AutofillEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "BackgroundFetchEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "BackgroundFetchManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BackgroundFetchRecord",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BackgroundFetchRegistration",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BackgroundFetchUpdateUIEvent",
    "kind": "interface",
    "parent": "BackgroundFetchEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "BarcodeDetector",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "BarProp",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BaseAudioContext",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Baseline",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BatteryManager",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BeforeInstallPromptEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "BeforeUnloadEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BiquadFilterNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Blob",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "BlobEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Bluetooth",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BluetoothAdvertisingEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "BluetoothCharacteristicProperties",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BluetoothDataFilter",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "BluetoothDevice",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BluetoothLEScan",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BluetoothLEScanFilter",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "BluetoothLEScanPermissionResult",
    "kind": "interface",
    "parent": "PermissionStatus",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BluetoothManufacturerDataFilter",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "BluetoothManufacturerDataMap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BluetoothPermissionResult",
    "kind": "interface",
    "parent": "PermissionStatus",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BluetoothRemoteGATTCharacteristic",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BluetoothRemoteGATTDescriptor",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BluetoothRemoteGATTServer",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BluetoothRemoteGATTService",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BluetoothServiceDataFilter",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "BluetoothServiceDataMap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BluetoothUUID",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BreakToken",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BroadcastChannel",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Browser",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BrowserCaptureMediaStreamTrack",
    "kind": "interface",
    "parent": "MediaStreamTrack",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "BufferedChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ByteLengthQueuingStrategy",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Cache",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CacheStorage",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CanMakePaymentEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CanvasCaptureMediaStreamTrack",
    "kind": "interface",
    "parent": "MediaStreamTrack",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CanvasGradient",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CanvasPattern",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CanvasRenderingContext2D",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CaptureActionEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CaptureController",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CapturedMouseEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CaretPosition",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CDATASection",
    "kind": "interface",
    "parent": "Text",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ChannelMergerNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ChannelSplitterNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ChapterInformation",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CharacterBoundsUpdateEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CharacterData",
    "kind": "interface",
    "parent": "Node",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ChildBreakToken",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Client",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Clients",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Clipboard",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ClipboardChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ClipboardEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ClipboardItem",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CloseEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CloseWatcher",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CommandEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Comment",
    "kind": "interface",
    "parent": "CharacterData",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CompositionEvent",
    "kind": "interface",
    "parent": "UIEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CompressionStream",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "console",
    "kind": "namespace",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ConstantSourceNode",
    "kind": "interface",
    "parent": "AudioScheduledSourceNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ContactAddress",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ContactsManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ContainerQueryList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ContentIndex",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ContentIndexEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ContentVisibilityAutoStateChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ConvolverNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CookieChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CookieStore",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "ServiceWorker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CookieStoreManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "ServiceWorker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CountQueuingStrategy",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CrashReportContext",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CreateMonitor",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Credential",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CredentialsContainer",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CropTarget",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CrossOriginStorageManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Crypto",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CryptoKey",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSS",
    "kind": "namespace",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSAnimation",
    "kind": "interface",
    "parent": "Animation",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSApplyBlockRule",
    "kind": "interface",
    "parent": "CSSGroupingRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSApplyStatementRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSColor",
    "kind": "interface",
    "parent": "CSSColorValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSColorProfileRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSColorValue",
    "kind": "interface",
    "parent": "CSSStyleValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSConditionRule",
    "kind": "interface",
    "parent": "CSSGroupingRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSContainerRule",
    "kind": "interface",
    "parent": "CSSConditionRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSContentsBlockRule",
    "kind": "interface",
    "parent": "CSSGroupingRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSContentsStatementRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSCounterStyleRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSCustomMediaRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSFontFaceDescriptors",
    "kind": "interface",
    "parent": "CSSStyleDeclaration",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSFontFaceRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSFontFeatureValuesMap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSFontFeatureValuesRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSFontPaletteValuesRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSFunctionDeclarations",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSFunctionDescriptors",
    "kind": "interface",
    "parent": "CSSStyleDeclaration",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSFunctionRule",
    "kind": "interface",
    "parent": "CSSGroupingRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSGroupingRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSHSL",
    "kind": "interface",
    "parent": "CSSColorValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSHWB",
    "kind": "interface",
    "parent": "CSSColorValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSImageValue",
    "kind": "interface",
    "parent": "CSSStyleValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSImportRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSKeyframeRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSKeyframesRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSKeywordValue",
    "kind": "interface",
    "parent": "CSSStyleValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSLab",
    "kind": "interface",
    "parent": "CSSColorValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSLayerBlockRule",
    "kind": "interface",
    "parent": "CSSGroupingRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSLayerStatementRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSLCH",
    "kind": "interface",
    "parent": "CSSColorValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSMarginRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSMathClamp",
    "kind": "interface",
    "parent": "CSSMathValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSMathInvert",
    "kind": "interface",
    "parent": "CSSMathValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSMathMax",
    "kind": "interface",
    "parent": "CSSMathValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSMathMin",
    "kind": "interface",
    "parent": "CSSMathValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSMathNegate",
    "kind": "interface",
    "parent": "CSSMathValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSMathProduct",
    "kind": "interface",
    "parent": "CSSMathValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSMathSum",
    "kind": "interface",
    "parent": "CSSMathValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSMathValue",
    "kind": "interface",
    "parent": "CSSNumericValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSMatrixComponent",
    "kind": "interface",
    "parent": "CSSTransformComponent",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSMediaRule",
    "kind": "interface",
    "parent": "CSSConditionRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSMixinRule",
    "kind": "interface",
    "parent": "CSSGroupingRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSNamespaceRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSNestedDeclarations",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSNumericArray",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSNumericValue",
    "kind": "interface",
    "parent": "CSSStyleValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSOKLab",
    "kind": "interface",
    "parent": "CSSColorValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSOKLCH",
    "kind": "interface",
    "parent": "CSSColorValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSPageDescriptors",
    "kind": "interface",
    "parent": "CSSStyleDeclaration",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSPageRule",
    "kind": "interface",
    "parent": "CSSGroupingRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSParserAtRule",
    "kind": "interface",
    "parent": "CSSParserRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSParserBlock",
    "kind": "interface",
    "parent": "CSSParserValue",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSParserDeclaration",
    "kind": "interface",
    "parent": "CSSParserRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSParserFunction",
    "kind": "interface",
    "parent": "CSSParserValue",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSParserQualifiedRule",
    "kind": "interface",
    "parent": "CSSParserRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSParserRule",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSParserValue",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSPerspective",
    "kind": "interface",
    "parent": "CSSTransformComponent",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSPositionTryDescriptors",
    "kind": "interface",
    "parent": "CSSStyleDeclaration",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSPositionTryRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSPropertyRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSPseudoElement",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSRGB",
    "kind": "interface",
    "parent": "CSSColorValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSRotate",
    "kind": "interface",
    "parent": "CSSTransformComponent",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSRule",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSRuleList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSScale",
    "kind": "interface",
    "parent": "CSSTransformComponent",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSScopeRule",
    "kind": "interface",
    "parent": "CSSGroupingRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSSkew",
    "kind": "interface",
    "parent": "CSSTransformComponent",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSSkewX",
    "kind": "interface",
    "parent": "CSSTransformComponent",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSSkewY",
    "kind": "interface",
    "parent": "CSSTransformComponent",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSStartingStyleRule",
    "kind": "interface",
    "parent": "CSSGroupingRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSStyleDeclaration",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSStyleProperties",
    "kind": "interface",
    "parent": "CSSStyleDeclaration",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSStyleRule",
    "kind": "interface",
    "parent": "CSSGroupingRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSStyleSheet",
    "kind": "interface",
    "parent": "StyleSheet",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSStyleValue",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSSupportsConditionRule",
    "kind": "interface",
    "parent": "CSSGroupingRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSSupportsRule",
    "kind": "interface",
    "parent": "CSSConditionRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSTransformComponent",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSTransformValue",
    "kind": "interface",
    "parent": "CSSStyleValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSTransition",
    "kind": "interface",
    "parent": "Animation",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CSSTranslate",
    "kind": "interface",
    "parent": "CSSTransformComponent",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSUnitValue",
    "kind": "interface",
    "parent": "CSSNumericValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSUnparsedValue",
    "kind": "interface",
    "parent": "CSSStyleValue",
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSVariableReferenceValue",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CSSViewTransitionRule",
    "kind": "interface",
    "parent": "CSSRule",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "CustomElementRegistry",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CustomEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "CustomStateSet",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DataCue",
    "kind": "interface",
    "parent": "TextTrackCue",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DataTransfer",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DataTransferItem",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DataTransferItemList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DecompressionStream",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DedicatedWorkerGlobalScope",
    "kind": "interface",
    "parent": "WorkerGlobalScope",
    "exposed": [
      "DedicatedWorker"
    ],
    "global": [
      "Worker",
      "DedicatedWorker"
    ],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": [
      {
        "name": "name",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "postMessage",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "postMessage",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "close",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "onrtctransform",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "requestAnimationFrame",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "cancelAnimationFrame",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "onmessage",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onmessageerror",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      }
    ]
  },
  {
    "name": "DelayNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DelegatedInkTrailPresenter",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DeviceChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DeviceMotionEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DeviceMotionEventAcceleration",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DeviceMotionEventRotationRate",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DeviceOrientationEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DevicePosture",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DigitalCredential",
    "kind": "interface",
    "parent": "Credential",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DigitalGoodsService",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Document",
    "kind": "interface",
    "parent": "Node",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DocumentFragment",
    "kind": "interface",
    "parent": "Node",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DocumentPictureInPicture",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DocumentPictureInPictureEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DocumentTimeline",
    "kind": "interface",
    "parent": "AnimationTimeline",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DocumentType",
    "kind": "interface",
    "parent": "Node",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DOMException",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DOMImplementation",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DOMMatrix",
    "kind": "interface",
    "parent": "DOMMatrixReadOnly",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DOMMatrixReadOnly",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DOMParser",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DOMPoint",
    "kind": "interface",
    "parent": "DOMPointReadOnly",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DOMPointReadOnly",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DOMQuad",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DOMRect",
    "kind": "interface",
    "parent": "DOMRectReadOnly",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DOMRectList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DOMRectReadOnly",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DOMStringList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DOMStringMap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DOMTokenList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "DragEvent",
    "kind": "interface",
    "parent": "MouseEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "DynamicsCompressorNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "EditContext",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Element",
    "kind": "interface",
    "parent": "Node",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ElementInternals",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "EncodedAudioChunk",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "EncodedVideoChunk",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ErrorEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Event",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "EventCounts",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "EventListener",
    "kind": "callback",
    "parent": null,
    "exposed": [],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EventSource",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "EventTarget",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Exception",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "EXT_blend_minmax",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_clip_control",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_color_buffer_float",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_color_buffer_half_float",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_conservative_depth",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_depth_clamp",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_disjoint_timer_query",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_disjoint_timer_query_webgl2",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_float_blend",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_frag_depth",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_polygon_offset_clamp",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_render_snorm",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_shader_texture_lod",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_sRGB",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_texture_compression_bptc",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_texture_compression_rgtc",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_texture_filter_anisotropic",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_texture_mirror_clamp_to_edge",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "EXT_texture_norm16",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "ExtendableCookieChangeEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ExtendableEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ExtendableMessageEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "External",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "EyeDropper",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "FaceDetector",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "FederatedCredential",
    "kind": "interface",
    "parent": "Credential",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Fence",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FencedFrameConfig",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "FetchEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "FetchLaterResult",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "File",
    "kind": "interface",
    "parent": "Blob",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "FileList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FileReader",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "FileReaderSync",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "DedicatedWorker",
      "SharedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "FileSystem",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FileSystemDirectoryEntry",
    "kind": "interface",
    "parent": "FileSystemEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FileSystemDirectoryHandle",
    "kind": "interface",
    "parent": "FileSystemHandle",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FileSystemDirectoryReader",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FileSystemEntry",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FileSystemFileEntry",
    "kind": "interface",
    "parent": "FileSystemEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FileSystemFileHandle",
    "kind": "interface",
    "parent": "FileSystemHandle",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FileSystemHandle",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FileSystemSyncAccessHandle",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FileSystemWritableFileStream",
    "kind": "interface",
    "parent": "WritableStream",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FocusEvent",
    "kind": "interface",
    "parent": "UIEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Font",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FontData",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FontFace",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "FontFaceFeatures",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FontFacePalette",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FontFacePalettes",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FontFaceSet",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FontFaceSetLoadEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "FontFaceVariationAxis",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FontFaceVariations",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FontMetrics",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FormData",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "FormDataEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "FragmentDirective",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "FragmentResult",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "GainNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Gamepad",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GamepadButton",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GamepadEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "GamepadHapticActuator",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Geolocation",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GeolocationCoordinates",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GeolocationPosition",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GeolocationPositionError",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Global",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "GPU",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUAdapter",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUAdapterInfo",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUBindGroup",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUBindGroupLayout",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUBuffer",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUBufferUsage",
    "kind": "namespace",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUCanvasContext",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUColorWrite",
    "kind": "namespace",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUCommandBuffer",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUCommandEncoder",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUCompilationInfo",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUCompilationMessage",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUComputePassEncoder",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUComputePipeline",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUDevice",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUDeviceLostInfo",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUError",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUExternalTexture",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUInternalError",
    "kind": "interface",
    "parent": "GPUError",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "GPUMapMode",
    "kind": "namespace",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUOutOfMemoryError",
    "kind": "interface",
    "parent": "GPUError",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "GPUPipelineError",
    "kind": "interface",
    "parent": "DOMException",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "GPUPipelineLayout",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUQuerySet",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUQueue",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPURenderBundle",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPURenderBundleEncoder",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPURenderPassEncoder",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPURenderPipeline",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUSampler",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUShaderModule",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUShaderStage",
    "kind": "namespace",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUSupportedFeatures",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUSupportedLimits",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUTexture",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUTextureUsage",
    "kind": "namespace",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUTextureView",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "GPUUncapturedErrorEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "GPUValidationError",
    "kind": "interface",
    "parent": "GPUError",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "GravitySensor",
    "kind": "interface",
    "parent": "Accelerometer",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "GroupEffect",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Gyroscope",
    "kind": "interface",
    "parent": "Sensor",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HandwritingDrawing",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "HandwritingRecognizer",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "HandwritingStroke",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HashChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Headers",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HID",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "DedicatedWorker",
      "ServiceWorker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "HIDConnectionEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "DedicatedWorker",
      "ServiceWorker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HIDDevice",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "DedicatedWorker",
      "ServiceWorker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "HIDInputReportEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "DedicatedWorker",
      "ServiceWorker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Highlight",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HighlightRegistry",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "History",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "HTMLAllCollection",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "HTMLAnchorElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLAreaElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLAudioElement",
    "kind": "interface",
    "parent": "HTMLMediaElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLBaseElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLBodyElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLBRElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLButtonElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLCameraElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLCanvasElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLCollection",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "HTMLDataElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLDataListElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLDetailsElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLDialogElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLDirectoryElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLDivElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLDListElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLElement",
    "kind": "interface",
    "parent": "Element",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLEmbedElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLFencedFrameElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLFieldSetElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLFontElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLFormControlsCollection",
    "kind": "interface",
    "parent": "HTMLCollection",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "HTMLFormElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLFrameElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLFrameSetElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLGeolocationElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLHeadElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLHeadingElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLHRElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLHtmlElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLIFrameElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLImageElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLInputElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLInstallElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLLabelElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLLegendElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLLIElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLLinkElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLMapElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLMarqueeElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLMediaElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "HTMLMenuElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLMetaElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLMeterElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLMicrophoneElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLModelElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "HTMLModElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLObjectElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLOListElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLOptGroupElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLOptionElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLOptionsCollection",
    "kind": "interface",
    "parent": "HTMLCollection",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "HTMLOutputElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLParagraphElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLParamElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLPictureElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLPortalElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLPreElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLProgressElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLQuoteElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLScriptElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLSelectedContentElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLSelectElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLSlotElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLSourceElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLSpanElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLStyleElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLTableCaptionElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLTableCellElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLTableColElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLTableElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLTableRowElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLTableSectionElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLTemplateElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLTextAreaElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLTimeElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLTitleElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLTrackElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLUListElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLUnknownElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "HTMLUserMediaElement",
    "kind": "interface",
    "parent": "HTMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "HTMLVideoElement",
    "kind": "interface",
    "parent": "HTMLMediaElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "IDBCursor",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IDBCursorWithValue",
    "kind": "interface",
    "parent": "IDBCursor",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IDBDatabase",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IDBFactory",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IDBIndex",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IDBKeyRange",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IDBObjectStore",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IDBOpenDBRequest",
    "kind": "interface",
    "parent": "IDBRequest",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IDBRecord",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IDBRequest",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IDBTransaction",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IDBVersionChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "IdentityCredential",
    "kind": "interface",
    "parent": "Credential",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IdentityCredentialError",
    "kind": "interface",
    "parent": "DOMException",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "IdentityProvider",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IdleDeadline",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IdleDetector",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "IIRFilterNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ImageBitmap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ImageBitmapRenderingContext",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ImageCapture",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ImageData",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ImageDecoder",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ImageTrack",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ImageTrackList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Ink",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "InputDeviceCapabilities",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "InputDeviceInfo",
    "kind": "interface",
    "parent": "MediaDeviceInfo",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "InputEvent",
    "kind": "interface",
    "parent": "UIEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "InstallEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "InstallResultEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Instance",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "InteractionContentfulPaint",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "IntersectionObserver",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "IntersectionObserverEntry",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "IntrinsicSizes",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Keyboard",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "KeyboardEvent",
    "kind": "interface",
    "parent": "UIEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "KeyboardLayoutMap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "KeyframeEffect",
    "kind": "interface",
    "parent": "AnimationEffect",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "KeyFrameRequestEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "KHR_parallel_shader_compile",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "LanguageDetector",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LanguageModel",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LanguageModelParams",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LanguageModelToolCall",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "LanguageModelToolError",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "LanguageModelToolSuccess",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "LargestContentfulPaint",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LaunchParams",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LaunchQueue",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LayoutChild",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LayoutConstraints",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LayoutEdges",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LayoutFragment",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LayoutShift",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LayoutShiftAttribution",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LayoutWorkletGlobalScope",
    "kind": "interface",
    "parent": "WorkletGlobalScope",
    "exposed": [
      "LayoutWorklet"
    ],
    "global": [
      "Worklet",
      "LayoutWorklet"
    ],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": [
      {
        "name": "registerLayout",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      }
    ]
  },
  {
    "name": "LinearAccelerationSensor",
    "kind": "interface",
    "parent": "Accelerometer",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Location",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Lock",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "LockManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Magnetometer",
    "kind": "interface",
    "parent": "Sensor",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ManagedMediaSource",
    "kind": "interface",
    "parent": "MediaSource",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ManagedSourceBuffer",
    "kind": "interface",
    "parent": "SourceBuffer",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MathMLAnchorElement",
    "kind": "interface",
    "parent": "MathMLElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MathMLElement",
    "kind": "interface",
    "parent": "Element",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaCapabilities",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaDeviceInfo",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaDevices",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaElementAudioSourceNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaEncryptedEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaError",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaKeyMessageEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaKeys",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaKeySession",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaKeyStatusMap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaKeySystemAccess",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaMetadata",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaQueryList",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaQueryListEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaRecorder",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaSession",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaSource",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaSourceHandle",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaStream",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaStreamAudioDestinationNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaStreamAudioSourceNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaStreamTrack",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaStreamTrackAudioSourceNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaStreamTrackAudioStats",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MediaStreamTrackEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaStreamTrackHandle",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaStreamTrackProcessor",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MediaStreamTrackVideoStats",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Memory",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MessageChannel",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MessageEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "Worker",
      "AudioWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MessagePort",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker",
      "AudioWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MIDIAccess",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MIDIConnectionEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MIDIInput",
    "kind": "interface",
    "parent": "MIDIPort",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MIDIInputMap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MIDIMessageEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MIDIOutput",
    "kind": "interface",
    "parent": "MIDIPort",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MIDIOutputMap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MIDIPort",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MimeType",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MimeTypeArray",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ML",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MLContext",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MLGraph",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MLGraphBuilder",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MLOperand",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "MLTensor",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ModelContext",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Module",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MouseEvent",
    "kind": "interface",
    "parent": "UIEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MutationObserver",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "MutationRecord",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NamedFlow",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NamedFlowMap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NamedNodeMap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NavigateEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Navigation",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NavigationActivation",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NavigationCurrentEntryChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "NavigationDestination",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NavigationEvent",
    "kind": "interface",
    "parent": "UIEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "NavigationHistoryEntry",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NavigationPrecommitController",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NavigationPreloadManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NavigationTransition",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Navigator",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NavigatorLogin",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NavigatorManagedData",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NavigatorUAData",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NDEFMessage",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "NDEFReader",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "NDEFReadingEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "NDEFRecord",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "NetworkInformation",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Node",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NodeFilter",
    "kind": "callback",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NodeIterator",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NodeList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NodeRange",
    "kind": "interface",
    "parent": "AbstractRange",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Notification",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "NotificationEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "NotRestoredReasonDetails",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NotRestoredReasons",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "NV_shader_noperspective_interpolation",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "Observable",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "OES_draw_buffers_indexed",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "OES_element_index_uint",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "OES_fbo_render_mipmap",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "OES_sample_variables",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "OES_shader_multisample_interpolation",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "OES_standard_derivatives",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "OES_texture_float",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "OES_texture_float_linear",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "OES_texture_half_float",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "OES_texture_half_float_linear",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "OES_vertex_array_object",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "OfflineAudioCompletionEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "OfflineAudioContext",
    "kind": "interface",
    "parent": "BaseAudioContext",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "OffscreenCanvas",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "OffscreenCanvasRenderingContext2D",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "OnAlarmEvent",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "OrientationSensor",
    "kind": "interface",
    "parent": "Sensor",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Origin",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "OscillatorNode",
    "kind": "interface",
    "parent": "AudioScheduledSourceNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "OTPCredential",
    "kind": "interface",
    "parent": "Credential",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "OverconstrainedError",
    "kind": "interface",
    "parent": "DOMException",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "OVR_multiview2",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "PageRevealEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PageSwapEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PageTransitionEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PaintRenderingContext2D",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "PaintWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PaintSize",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "PaintWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PaintWorkletGlobalScope",
    "kind": "interface",
    "parent": "WorkletGlobalScope",
    "exposed": [
      "PaintWorklet"
    ],
    "global": [
      "Worklet",
      "PaintWorklet"
    ],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": [
      {
        "name": "registerPaint",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "devicePixelRatio",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      }
    ]
  },
  {
    "name": "PannerNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PasswordCredential",
    "kind": "interface",
    "parent": "Credential",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Path2D",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PaymentManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PaymentMethodChangeEvent",
    "kind": "interface",
    "parent": "PaymentRequestUpdateEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PaymentRequest",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PaymentRequestEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PaymentRequestUpdateEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PaymentResponse",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Performance",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceContainerTiming",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceElementTiming",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceEntry",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceEventTiming",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceLongAnimationFrameTiming",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceLongTaskTiming",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceMark",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PerformanceMeasure",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceNavigation",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceNavigationTiming",
    "kind": "interface",
    "parent": "PerformanceResourceTiming",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceObserver",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PerformanceObserverEntryList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformancePaintTiming",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceResourceTiming",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceScriptTiming",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceServerTiming",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceSoftNavigation",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceTiming",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PerformanceTimingConfidence",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PeriodicSyncEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PeriodicSyncManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PeriodicWave",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Permissions",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PermissionsPolicy",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PermissionStatus",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PictureInPictureEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PictureInPictureWindow",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Plugin",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PluginArray",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PointerEvent",
    "kind": "interface",
    "parent": "MouseEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PointerTimeline",
    "kind": "interface",
    "parent": "AnimationTimeline",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PopStateEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PortalActivateEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PortalHost",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PreferenceManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PreferenceObject",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Presentation",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PresentationAvailability",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PresentationConnection",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PresentationConnectionAvailableEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PresentationConnectionCloseEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PresentationConnectionList",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PresentationReceiver",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PresentationRequest",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PressureObserver",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "DedicatedWorker",
      "SharedWorker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PressureRecord",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "DedicatedWorker",
      "SharedWorker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ProcessingInstruction",
    "kind": "interface",
    "parent": "CharacterData",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Profiler",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ProgressEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PromiseRejectionEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Proofreader",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ProximitySensor",
    "kind": "interface",
    "parent": "Sensor",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PublicKeyCredential",
    "kind": "interface",
    "parent": "Credential",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PushEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PushManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PushMessageData",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PushSubscription",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "PushSubscriptionChangeEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "PushSubscriptionOptions",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "QuotaExceededError",
    "kind": "interface",
    "parent": "DOMException",
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RadioNodeList",
    "kind": "interface",
    "parent": "NodeList",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Range",
    "kind": "interface",
    "parent": "NodeRange",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ReadableByteStreamController",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ReadableStream",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ReadableStreamBYOBReader",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ReadableStreamBYOBRequest",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ReadableStreamDefaultController",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ReadableStreamDefaultReader",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RelativeOrientationSensor",
    "kind": "interface",
    "parent": "OrientationSensor",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RemotePlayback",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ReportingObserver",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Request",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ResizeObserver",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ResizeObserverEntry",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ResizeObserverSize",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Response",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RestrictionTarget",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Rewriter",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCCertificate",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCDataChannel",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCDataChannelEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCDtlsTransport",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCDTMFSender",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCDTMFToneChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCEncodedAudioFrame",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCEncodedVideoFrame",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCError",
    "kind": "interface",
    "parent": "DOMException",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCErrorEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCIceCandidate",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCIceCandidatePair",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCIceCandidatePairEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCIceTransport",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCIdentityAssertion",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCIdentityProviderGlobalScope",
    "kind": "interface",
    "parent": "WorkerGlobalScope",
    "exposed": [
      "RTCIdentityProvider"
    ],
    "global": [
      "Worker",
      "RTCIdentityProvider"
    ],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": [
      {
        "name": "rtcIdentityProvider",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      }
    ]
  },
  {
    "name": "RTCIdentityProviderRegistrar",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "RTCIdentityProvider"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCPeerConnection",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCPeerConnectionIceErrorEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCPeerConnectionIceEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCRtpReceiver",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCRtpScriptTransform",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCRtpScriptTransformer",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCRtpSender",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCRtpSFrameDecryptor",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCRtpSFrameEncryptor",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCRtpTransceiver",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCSctpTransport",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCSessionDescription",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCStatsReport",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "RTCTrackEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "RTCTransformEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Sanitizer",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Scheduler",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Scheduling",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Screen",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ScreenDetailed",
    "kind": "interface",
    "parent": "Screen",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ScreenDetails",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ScreenOrientation",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ScriptProcessorNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ScrollTimeline",
    "kind": "interface",
    "parent": "AnimationTimeline",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SecurityPolicyViolationEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Selection",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Sensor",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "DedicatedWorker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SensorErrorEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "DedicatedWorker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SequenceEffect",
    "kind": "interface",
    "parent": "GroupEffect",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Serial",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "DedicatedWorker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SerialPort",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "DedicatedWorker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ServiceWorker",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ServiceWorkerContainer",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ServiceWorkerGlobalScope",
    "kind": "interface",
    "parent": "WorkerGlobalScope",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [
      "Worker",
      "ServiceWorker"
    ],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": [
      {
        "name": "clients",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SameObject"
        ],
        "readonly": true
      },
      {
        "name": "registration",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SameObject"
        ],
        "readonly": true
      },
      {
        "name": "serviceWorker",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SameObject"
        ],
        "readonly": true
      },
      {
        "name": "skipWaiting",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": [
          "NewObject"
        ]
      },
      {
        "name": "oninstall",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onactivate",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onfetch",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onmessage",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onmessageerror",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onsync",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oncontentdelete",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "cookieStore",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SameObject"
        ],
        "readonly": true
      },
      {
        "name": "oncookiechange",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onnotificationclick",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onnotificationclose",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onperiodicsync",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpush",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpushsubscriptionchange",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onbackgroundfetchsuccess",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onbackgroundfetchfail",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onbackgroundfetchabort",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onbackgroundfetchclick",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oncanmakepayment",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpaymentrequest",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "browser",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      }
    ]
  },
  {
    "name": "ServiceWorkerRegistration",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SFrameDecryptorStream",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SFrameEncryptorStream",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SFrameTransformErrorEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ShadowAnimation",
    "kind": "interface",
    "parent": "Animation",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ShadowRoot",
    "kind": "interface",
    "parent": "DocumentFragment",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SharedWorker",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SharedWorkerGlobalScope",
    "kind": "interface",
    "parent": "WorkerGlobalScope",
    "exposed": [
      "SharedWorker"
    ],
    "global": [
      "Worker",
      "SharedWorker"
    ],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": [
      {
        "name": "name",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "close",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "onconnect",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      }
    ]
  },
  {
    "name": "SnapEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SourceBuffer",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SourceBufferList",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SpeechGrammar",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SpeechGrammarList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SpeechRecognition",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SpeechRecognitionAlternative",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SpeechRecognitionErrorEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SpeechRecognitionEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SpeechRecognitionPhrase",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SpeechRecognitionResult",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SpeechRecognitionResultList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SpeechSynthesis",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SpeechSynthesisErrorEvent",
    "kind": "interface",
    "parent": "SpeechSynthesisEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SpeechSynthesisEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SpeechSynthesisUtterance",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SpeechSynthesisVoice",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "StaticRange",
    "kind": "interface",
    "parent": "NodeRange",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "StereoPannerNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Storage",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "StorageAccessHandle",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "StorageBucket",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "StorageBucketManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "StorageEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "StorageManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "StylePropertyMap",
    "kind": "interface",
    "parent": "StylePropertyMapReadOnly",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "StylePropertyMapReadOnly",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker",
      "PaintWorklet",
      "LayoutWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "StyleSheet",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "StyleSheetList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SubmitEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Subscriber",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SubtleCrypto",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Summarizer",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAElement",
    "kind": "interface",
    "parent": "SVGGraphicsElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAngle",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimatedAngle",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimatedBoolean",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimatedEnumeration",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimatedInteger",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimatedLength",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimatedLengthList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimatedNumber",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimatedNumberList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimatedPreserveAspectRatio",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimatedRect",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimatedString",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimatedTransformList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimateElement",
    "kind": "interface",
    "parent": "SVGAnimationElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimateMotionElement",
    "kind": "interface",
    "parent": "SVGAnimationElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimateTransformElement",
    "kind": "interface",
    "parent": "SVGAnimationElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGAnimationElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGCircleElement",
    "kind": "interface",
    "parent": "SVGGeometryElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGClipPathElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGComponentTransferFunctionElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGDefsElement",
    "kind": "interface",
    "parent": "SVGGraphicsElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGDescElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGElement",
    "kind": "interface",
    "parent": "Element",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGEllipseElement",
    "kind": "interface",
    "parent": "SVGGeometryElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEBlendElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEColorMatrixElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEComponentTransferElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFECompositeElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEConvolveMatrixElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEDiffuseLightingElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEDisplacementMapElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEDistantLightElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEDropShadowElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEFloodElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEFuncAElement",
    "kind": "interface",
    "parent": "SVGComponentTransferFunctionElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEFuncBElement",
    "kind": "interface",
    "parent": "SVGComponentTransferFunctionElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEFuncGElement",
    "kind": "interface",
    "parent": "SVGComponentTransferFunctionElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEFuncRElement",
    "kind": "interface",
    "parent": "SVGComponentTransferFunctionElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEGaussianBlurElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEImageElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEMergeElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEMergeNodeElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEMorphologyElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEOffsetElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFEPointLightElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFESpecularLightingElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFESpotLightElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFETileElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFETurbulenceElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGFilterElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGForeignObjectElement",
    "kind": "interface",
    "parent": "SVGGraphicsElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGGElement",
    "kind": "interface",
    "parent": "SVGGraphicsElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGGeometryElement",
    "kind": "interface",
    "parent": "SVGGraphicsElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGGradientElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGGraphicsElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGImageElement",
    "kind": "interface",
    "parent": "SVGGraphicsElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGLength",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGLengthList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGLinearGradientElement",
    "kind": "interface",
    "parent": "SVGGradientElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGLineElement",
    "kind": "interface",
    "parent": "SVGGeometryElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGMarkerElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGMaskElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGMetadataElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGMPathElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGNumber",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGNumberList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGPathElement",
    "kind": "interface",
    "parent": "SVGGeometryElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGPathSegment",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGPatternElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGPointList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGPolygonElement",
    "kind": "interface",
    "parent": "SVGGeometryElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGPolylineElement",
    "kind": "interface",
    "parent": "SVGGeometryElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGPreserveAspectRatio",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGRadialGradientElement",
    "kind": "interface",
    "parent": "SVGGradientElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGRectElement",
    "kind": "interface",
    "parent": "SVGGeometryElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGScriptElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGSetElement",
    "kind": "interface",
    "parent": "SVGAnimationElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGStopElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGStringList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGStyleElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGSVGElement",
    "kind": "interface",
    "parent": "SVGGraphicsElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGSwitchElement",
    "kind": "interface",
    "parent": "SVGGraphicsElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGSymbolElement",
    "kind": "interface",
    "parent": "SVGGraphicsElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGTextContentElement",
    "kind": "interface",
    "parent": "SVGGraphicsElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGTextElement",
    "kind": "interface",
    "parent": "SVGTextPositioningElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGTextPathElement",
    "kind": "interface",
    "parent": "SVGTextContentElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGTextPositioningElement",
    "kind": "interface",
    "parent": "SVGTextContentElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGTitleElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGTransform",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGTransformList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGTSpanElement",
    "kind": "interface",
    "parent": "SVGTextPositioningElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGUnitTypes",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGUseElement",
    "kind": "interface",
    "parent": "SVGGraphicsElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SVGViewElement",
    "kind": "interface",
    "parent": "SVGElement",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "SyncEvent",
    "kind": "interface",
    "parent": "ExtendableEvent",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "SyncManager",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Table",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Tag",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TaskAttributionTiming",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TaskController",
    "kind": "interface",
    "parent": "AbortController",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TaskPriorityChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TaskSignal",
    "kind": "interface",
    "parent": "AbortSignal",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TestUtils",
    "kind": "namespace",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Text",
    "kind": "interface",
    "parent": "CharacterData",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TextDecoder",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TextDecoderStream",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TextDetector",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TextEncoder",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TextEncoderStream",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TextEvent",
    "kind": "interface",
    "parent": "UIEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TextFormat",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TextFormatUpdateEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TextMetrics",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TextTrack",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TextTrackCue",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TextTrackCueList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TextTrackList",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TextUpdateEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TimeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TimeRanges",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ToggleEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ToolActivatedEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ToolCancelEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Touch",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TouchEvent",
    "kind": "interface",
    "parent": "UIEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TouchList",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TrackEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TransformStream",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "TransformStreamDefaultController",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TransitionEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Translator",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TreeWalker",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TrustedHTML",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TrustedHTMLParserOptions",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TrustedScript",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TrustedScriptURL",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TrustedTypePolicy",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "TrustedTypePolicyFactory",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "UIEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "UncalibratedMagnetometer",
    "kind": "interface",
    "parent": "Sensor",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "URL",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "URLPattern",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "URLSearchParams",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "USB",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "USBAlternateInterface",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "USBConfiguration",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "USBConnectionEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "USBDevice",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "USBEndpoint",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "USBInterface",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "USBInTransferResult",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "USBIsochronousInTransferPacket",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "USBIsochronousInTransferResult",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "USBIsochronousOutTransferPacket",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "USBIsochronousOutTransferResult",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "USBOutTransferResult",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "USBPermissionResult",
    "kind": "interface",
    "parent": "PermissionStatus",
    "exposed": [
      "Worker",
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "UserActivation",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ValidityState",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ValueEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "VideoColorSpace",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "VideoDecoder",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "VideoEncoder",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "VideoFrame",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "VideoPlaybackQuality",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "VideoTrack",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "VideoTrackGenerator",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "DedicatedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "VideoTrackList",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Viewport",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ViewTimeline",
    "kind": "interface",
    "parent": "ScrollTimeline",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "ViewTransition",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "ViewTransitionTypeSet",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "VirtualKeyboard",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "VisibilityStateEntry",
    "kind": "interface",
    "parent": "PerformanceEntry",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "VisualViewport",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "VTTCue",
    "kind": "interface",
    "parent": "TextTrackCue",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "VTTRegion",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "WakeLock",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WakeLockSentinel",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WaveShaperNode",
    "kind": "interface",
    "parent": "AudioNode",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "WebAssembly",
    "kind": "namespace",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_blend_equation_advanced_coherent",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_blend_func_extended",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_clip_cull_distance",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_color_buffer_float",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_compressed_texture_astc",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_compressed_texture_etc",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_compressed_texture_etc1",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_compressed_texture_pvrtc",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_compressed_texture_s3tc",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_compressed_texture_s3tc_srgb",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_debug_renderer_info",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_debug_shaders",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_depth_texture",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_draw_buffers",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_draw_instanced_base_vertex_base_instance",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_lose_context",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_multi_draw",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_multi_draw_instanced_base_vertex_base_instance",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_polygon_mode",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_provoking_vertex",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_render_shared_exponent",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_shader_pixel_local_storage",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WEBGL_stencil_texturing",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGL2RenderingContext",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLActiveInfo",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLBuffer",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLContextEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "WebGLFramebuffer",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLObject",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLProgram",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLQuery",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLRenderbuffer",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLRenderingContext",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLSampler",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLShader",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLShaderPrecisionFormat",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLSync",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLTexture",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLTimerQueryEXT",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLTransformFeedback",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLUniformLocation",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLVertexArrayObject",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebGLVertexArrayObjectOES",
    "kind": "interface",
    "parent": "WebGLObject",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebSocket",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "WebTransport",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "WebTransportBidirectionalStream",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebTransportDatagramDuplexStream",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebTransportDatagramsWritable",
    "kind": "interface",
    "parent": "WritableStream",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebTransportError",
    "kind": "interface",
    "parent": "DOMException",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "WebTransportReceiveStream",
    "kind": "interface",
    "parent": "ReadableStream",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebTransportSendGroup",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebTransportSendStream",
    "kind": "interface",
    "parent": "WritableStream",
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WebTransportWriter",
    "kind": "interface",
    "parent": "WritableStreamDefaultWriter",
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WGSLLanguageFeatures",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window",
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WheelEvent",
    "kind": "interface",
    "parent": "MouseEvent",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Window",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [
      "Window"
    ],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": [
      {
        "name": "window",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "LegacyUnforgeable"
        ],
        "readonly": true
      },
      {
        "name": "self",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "document",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "LegacyUnforgeable"
        ],
        "readonly": true
      },
      {
        "name": "name",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "location",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "PutForwards",
          "LegacyUnforgeable"
        ],
        "readonly": true
      },
      {
        "name": "history",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "navigation",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "customElements",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "locationbar",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "menubar",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "personalbar",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "scrollbars",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "statusbar",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "toolbar",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "status",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "close",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "closed",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "stop",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "focus",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "blur",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "frames",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "length",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "top",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "LegacyUnforgeable"
        ],
        "readonly": true
      },
      {
        "name": "opener",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "parent",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "frameElement",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "open",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "navigator",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "clientInformation",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "originAgentCluster",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "alert",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "alert",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "confirm",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "prompt",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "print",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "postMessage",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "postMessage",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "orientation",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "onorientationchange",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "cookieStore",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SameObject"
        ],
        "readonly": true
      },
      {
        "name": "crashReport",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "navigate",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "requestResize",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "viewport",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SameObject",
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "matchMedia",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": [
          "NewObject"
        ]
      },
      {
        "name": "screen",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SameObject",
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "visualViewport",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SameObject",
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "moveTo",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "moveBy",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "resizeTo",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "resizeBy",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "innerWidth",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "innerHeight",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "scrollX",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "pageXOffset",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "scrollY",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "pageYOffset",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "scroll",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "scroll",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "scrollTo",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "scrollTo",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "scrollBy",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "scrollBy",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "screenX",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "screenLeft",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "screenY",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "screenTop",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "outerWidth",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "outerHeight",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "devicePixelRatio",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "getComputedStyle",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": [
          "NewObject"
        ]
      },
      {
        "name": "getDigitalGoodsService",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": [
          "SecureContext"
        ]
      },
      {
        "name": "documentPictureInPicture",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SameObject",
          "SecureContext"
        ],
        "readonly": true
      },
      {
        "name": "event",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "fence",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "fetchLater",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": [
          "NewObject",
          "SecureContext"
        ]
      },
      {
        "name": "showOpenFilePicker",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "showSaveFilePicker",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "showDirectoryPicker",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "credentialless",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "captureEvents",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "releaseEvents",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "external",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable",
          "SameObject"
        ],
        "readonly": true
      },
      {
        "name": "queryLocalFonts",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "onappinstalled",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onbeforeinstallprompt",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ondeviceorientation",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SecureContext"
        ],
        "readonly": false
      },
      {
        "name": "ondeviceorientationabsolute",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SecureContext"
        ],
        "readonly": false
      },
      {
        "name": "ondevicemotion",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SecureContext"
        ],
        "readonly": false
      },
      {
        "name": "portalHost",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "requestIdleCallback",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "cancelIdleCallback",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "getSelection",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "speechSynthesis",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SameObject"
        ],
        "readonly": true
      },
      {
        "name": "launchQueue",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "browser",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "getScreenDetails",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": [
          "SecureContext"
        ]
      },
      {
        "name": "minimize",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": [
          "SecureContext"
        ]
      },
      {
        "name": "maximize",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": [
          "SecureContext"
        ]
      },
      {
        "name": "restore",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": [
          "SecureContext"
        ]
      },
      {
        "name": "setResizable",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": [
          "SecureContext"
        ]
      },
      {
        "name": "onanimationstart",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onanimationiteration",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onanimationend",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onanimationcancel",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onsnapchanged",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onsnapchanging",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ontransitionrun",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ontransitionstart",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ontransitionend",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ontransitioncancel",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onfencedtreeclick",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onabort",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onauxclick",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onbeforeinput",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onbeforematch",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onbeforetoggle",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onblur",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oncancel",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oncanplay",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oncanplaythrough",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onchange",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onclick",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onclose",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oncommand",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oncontextlost",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oncontextmenu",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oncontextrestored",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oncopy",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oncuechange",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oncut",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ondblclick",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ondrag",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ondragend",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ondragenter",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ondragleave",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ondragover",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ondragstart",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ondrop",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ondurationchange",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onemptied",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onended",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onerror",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onfocus",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onformdata",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oninput",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oninvalid",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onkeydown",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onkeypress",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onkeyup",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onload",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onloadeddata",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onloadedmetadata",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onloadstart",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onmousedown",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onmouseenter",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "LegacyLenientThis"
        ],
        "readonly": false
      },
      {
        "name": "onmouseleave",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "LegacyLenientThis"
        ],
        "readonly": false
      },
      {
        "name": "onmousemove",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onmouseout",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onmouseover",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onmouseup",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpaste",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpause",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onplay",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onplaying",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onprogress",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onratechange",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onreset",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onresize",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onscroll",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onscrollend",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onsecuritypolicyviolation",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onseeked",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onseeking",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onselect",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onslotchange",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onstalled",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onsubmit",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onsuspend",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ontimeupdate",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ontoggle",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onvolumechange",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onwaiting",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onwebkitanimationend",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onwebkitanimationiteration",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onwebkitanimationstart",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onwebkittransitionend",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onwheel",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "oninstallresult",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpointerover",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpointerenter",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpointerdown",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpointermove",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpointerrawupdate",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SecureContext"
        ],
        "readonly": false
      },
      {
        "name": "onpointerup",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpointercancel",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpointerout",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpointerleave",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ongotpointercapture",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onlostpointercapture",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onselectstart",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onselectionchange",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ontouchstart",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ontouchend",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ontouchmove",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ontouchcancel",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onbeforexrselect",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ongamepadconnected",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ongamepaddisconnected",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onafterprint",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onbeforeprint",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onbeforeunload",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onhashchange",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onlanguagechange",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onmessage",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onmessageerror",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onoffline",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "ononline",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpagehide",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpagereveal",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpageshow",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpageswap",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onpopstate",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onrejectionhandled",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onstorage",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onunhandledrejection",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onunload",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "onportalactivate",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": false
      },
      {
        "name": "indexedDB",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SameObject"
        ],
        "readonly": true
      },
      {
        "name": "fetch",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": [
          "NewObject"
        ]
      },
      {
        "name": "performance",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "origin",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "isSecureContext",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "crossOriginIsolated",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "reportError",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "btoa",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "atob",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "setTimeout",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "clearTimeout",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "setInterval",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "clearInterval",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "queueMicrotask",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "createImageBitmap",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "createImageBitmap",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "structuredClone",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "scheduler",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "Replaceable"
        ],
        "readonly": true
      },
      {
        "name": "caches",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SecureContext",
          "SameObject"
        ],
        "readonly": true
      },
      {
        "name": "trustedTypes",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "crypto",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [
          "SameObject"
        ],
        "readonly": true
      },
      {
        "name": "requestAnimationFrame",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "cancelAnimationFrame",
        "kind": "operation",
        "static": false,
        "exposed": [],
        "attributes": []
      },
      {
        "name": "sessionStorage",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "localStorage",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      },
      {
        "name": "pushManager",
        "kind": "attribute",
        "static": false,
        "exposed": [],
        "attributes": [],
        "readonly": true
      }
    ]
  },
  {
    "name": "WindowClient",
    "kind": "interface",
    "parent": "Client",
    "exposed": [
      "ServiceWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WindowControlsOverlay",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WindowControlsOverlayGeometryChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Worker",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker",
      "SharedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "WorkerGlobalScope",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WorkerLocation",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WorkerNavigator",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "Worklet",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WorkletAnimation",
    "kind": "interface",
    "parent": "Animation",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "WorkletAnimationEffect",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "AnimationWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WorkletGlobalScope",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Worklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WorkletGroupEffect",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "AnimationWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WorkletPerformance",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "AudioWorklet"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WritableStream",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "WritableStreamDefaultController",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "WritableStreamDefaultWriter",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "*"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "Writer",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XMLDocument",
    "kind": "interface",
    "parent": "Document",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XMLHttpRequest",
    "kind": "interface",
    "parent": "XMLHttpRequestEventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker",
      "SharedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XMLHttpRequestEventTarget",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker",
      "SharedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XMLHttpRequestUpload",
    "kind": "interface",
    "parent": "XMLHttpRequestEventTarget",
    "exposed": [
      "Window",
      "DedicatedWorker",
      "SharedWorker"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XMLSerializer",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XPathEvaluator",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XPathExpression",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XPathNSResolver",
    "kind": "callback",
    "parent": null,
    "exposed": [],
    "global": [],
    "hasInterfaceObject": false,
    "constructable": false,
    "members": []
  },
  {
    "name": "XPathResult",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRAnchor",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRAnchorSet",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRBody",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRBodySpace",
    "kind": "interface",
    "parent": "XRSpace",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRBoundedReferenceSpace",
    "kind": "interface",
    "parent": "XRReferenceSpace",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRCamera",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRCompositionLayer",
    "kind": "interface",
    "parent": "XRLayer",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRCPUDepthInformation",
    "kind": "interface",
    "parent": "XRDepthInformation",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRCubeLayer",
    "kind": "interface",
    "parent": "XRCompositionLayer",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRCylinderLayer",
    "kind": "interface",
    "parent": "XRCompositionLayer",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRDepthInformation",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XREquirectLayer",
    "kind": "interface",
    "parent": "XRCompositionLayer",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRFrame",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRGPUBinding",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XRGPUDepthInformation",
    "kind": "interface",
    "parent": "XRDepthInformation",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRGPUSubImage",
    "kind": "interface",
    "parent": "XRSubImage",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRHand",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRHitTestResult",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRHitTestSource",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRInputSource",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRInputSourceArray",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRInputSourceEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XRInputSourcesChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XRJointPose",
    "kind": "interface",
    "parent": "XRPose",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRJointSpace",
    "kind": "interface",
    "parent": "XRSpace",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRLayer",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRLayerEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XRLightEstimate",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRLightProbe",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRMediaBinding",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XRMesh",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRMeshSet",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRPermissionStatus",
    "kind": "interface",
    "parent": "PermissionStatus",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRPlane",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRPlaneSet",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRPose",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRProjectionLayer",
    "kind": "interface",
    "parent": "XRCompositionLayer",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRQuadLayer",
    "kind": "interface",
    "parent": "XRCompositionLayer",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRRay",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XRReferenceSpace",
    "kind": "interface",
    "parent": "XRSpace",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRReferenceSpaceEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XRRenderState",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRRigidTransform",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XRSession",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRSessionEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XRSpace",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRSubImage",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRSystem",
    "kind": "interface",
    "parent": "EventTarget",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRTransientInputHitTestResult",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRTransientInputHitTestSource",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRView",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRViewerPose",
    "kind": "interface",
    "parent": "XRPose",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRViewport",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRVisibilityMaskChangeEvent",
    "kind": "interface",
    "parent": "Event",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XRWebGLBinding",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XRWebGLDepthInformation",
    "kind": "interface",
    "parent": "XRDepthInformation",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XRWebGLLayer",
    "kind": "interface",
    "parent": "XRLayer",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  },
  {
    "name": "XRWebGLSubImage",
    "kind": "interface",
    "parent": "XRSubImage",
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": false,
    "members": []
  },
  {
    "name": "XSLTProcessor",
    "kind": "interface",
    "parent": null,
    "exposed": [
      "Window"
    ],
    "global": [],
    "hasInterfaceObject": true,
    "constructable": true,
    "members": []
  }
];
