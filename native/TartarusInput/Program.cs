using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

internal static class Program
{
    private const int WM_INPUT = 0x00FF;
    private const int RIM_TYPEKEYBOARD = 1;
    private const uint RID_INPUT = 0x10000003;
    private const uint RIDI_DEVICENAME = 0x20000007;
    private const uint RIDEV_INPUTSINK = 0x00000100;
    private const ushort RI_KEY_BREAK = 1;
    private const ushort RI_KEY_E0 = 2;
    private static readonly IntPtr HWND_MESSAGE = new(-3);

    private static readonly Dictionary<IntPtr, bool> KnownDevices = new();
    private static readonly HashSet<int> LastDown = new();
    private static WndProcDelegate? _wndProcKeepAlive;
    private static bool _deviceSeen;

    private static int Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        WriteJson(new { status = "starting" });

        _wndProcKeepAlive = WndProc;
        var wndClass = new WNDCLASS
        {
            lpfnWndProc = _wndProcKeepAlive,
            hInstance = GetModuleHandle(null),
            lpszClassName = "BphTartarusRawInput",
        };

        if (RegisterClass(ref wndClass) == 0)
        {
            WriteJson(new { error = "RegisterClass failed", code = Marshal.GetLastWin32Error() });
            return 1;
        }

        var hwnd = CreateWindowEx(
            0,
            "BphTartarusRawInput",
            "BphTartarusRawInput",
            0,
            0, 0, 0, 0,
            HWND_MESSAGE,
            IntPtr.Zero,
            wndClass.hInstance,
            IntPtr.Zero);

        if (hwnd == IntPtr.Zero)
        {
            WriteJson(new { error = "CreateWindowEx failed", code = Marshal.GetLastWin32Error() });
            return 1;
        }

        var rid = new RAWINPUTDEVICE
        {
            usUsagePage = 0x01,
            usUsage = 0x06,
            dwFlags = RIDEV_INPUTSINK,
            hwndTarget = hwnd,
        };

        if (!RegisterRawInputDevices([rid], 1, (uint)Marshal.SizeOf<RAWINPUTDEVICE>()))
        {
            WriteJson(new { error = "RegisterRawInputDevices failed", code = Marshal.GetLastWin32Error() });
            return 1;
        }

        WriteJson(new
        {
            status = "ready",
            vid = "1532",
            note = "Listen-only Raw Input. Does not change how Windows classifies the Tartarus (still a HID keyboard).",
        });

        while (GetMessage(out var msg, IntPtr.Zero, 0, 0) > 0)
        {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }

        return 0;
    }

    private static void WriteJson(object payload)
    {
        Console.WriteLine(JsonSerializer.Serialize(payload));
        Console.Out.Flush();
    }

    private static IntPtr WndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WM_INPUT)
        {
            HandleRawInput(lParam);
            return IntPtr.Zero;
        }
        return DefWindowProc(hWnd, msg, wParam, lParam);
    }

    private static void HandleRawInput(IntPtr lParam)
    {
        uint size = 0;
        GetRawInputData(lParam, RID_INPUT, IntPtr.Zero, ref size, (uint)Marshal.SizeOf<RAWINPUTHEADER>());
        if (size == 0) return;

        var buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            if (GetRawInputData(lParam, RID_INPUT, buffer, ref size, (uint)Marshal.SizeOf<RAWINPUTHEADER>()) != size)
                return;

            var header = Marshal.PtrToStructure<RAWINPUTHEADER>(buffer);
            if (header.dwType != RIM_TYPEKEYBOARD) return;
            if (!IsTartarusDevice(header.hDevice)) return;

            var keyboard = Marshal.PtrToStructure<RAWKEYBOARD>(
                IntPtr.Add(buffer, Marshal.SizeOf<RAWINPUTHEADER>()));

            var vKey = keyboard.VKey;
            if (vKey == 0) return;

            var down = (keyboard.Flags & RI_KEY_BREAK) == 0;
            if (down)
            {
                if (!LastDown.Add(vKey)) return;
            }
            else
            {
                LastDown.Remove(vKey);
            }

            WriteJson(new
            {
                type = "key",
                vKey,
                down,
                e0 = (keyboard.Flags & RI_KEY_E0) != 0,
                name = KeyName(vKey),
            });
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static string KeyName(int vKey) => vKey switch
    {
        0x25 => "Left",
        0x26 => "Up",
        0x27 => "Right",
        0x28 => "Down",
        0x20 => "Space",
        0x0D => "Enter",
        0x1B => "Esc",
        0x09 => "Tab",
        0x10 => "Shift",
        0x11 => "Ctrl",
        0x12 => "Alt",
        >= 0x30 and <= 0x39 => ((char)vKey).ToString(),
        >= 0x41 and <= 0x5A => ((char)vKey).ToString(),
        >= 0x70 and <= 0x7B => $"F{vKey - 0x6F}",
        _ => $"VK_{vKey:X2}",
    };

    private static bool IsTartarusDevice(IntPtr device)
    {
        if (KnownDevices.TryGetValue(device, out var cached)) return cached;

        uint size = 0;
        GetRawInputDeviceInfo(device, RIDI_DEVICENAME, IntPtr.Zero, ref size);
        if (size == 0)
        {
            KnownDevices[device] = false;
            return false;
        }

        var nameBuf = Marshal.AllocHGlobal((int)size * 2);
        try
        {
            if (GetRawInputDeviceInfo(device, RIDI_DEVICENAME, nameBuf, ref size) == unchecked((uint)-1))
            {
                KnownDevices[device] = false;
                return false;
            }

            var name = Marshal.PtrToStringUni(nameBuf) ?? "";
            var match =
                name.Contains("VID_1532", StringComparison.OrdinalIgnoreCase)
                && (name.Contains("PID_0208", StringComparison.OrdinalIgnoreCase)
                    || name.Contains("PID_022B", StringComparison.OrdinalIgnoreCase)
                    || name.Contains("PID_0244", StringComparison.OrdinalIgnoreCase));

            if (!match && name.Contains("VID_1532", StringComparison.OrdinalIgnoreCase)
                && name.Contains("Tartarus", StringComparison.OrdinalIgnoreCase))
            {
                match = true;
            }

            KnownDevices[device] = match;
            if (match && !_deviceSeen)
            {
                _deviceSeen = true;
                WriteJson(new { status = "device", path = name });
            }
            return match;
        }
        finally
        {
            Marshal.FreeHGlobal(nameBuf);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTDEVICE
    {
        public ushort usUsagePage;
        public ushort usUsage;
        public uint dwFlags;
        public IntPtr hwndTarget;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTHEADER
    {
        public uint dwType;
        public uint dwSize;
        public IntPtr hDevice;
        public IntPtr wParam;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RAWKEYBOARD
    {
        public ushort MakeCode;
        public ushort Flags;
        public ushort Reserved;
        public ushort VKey;
        public uint Message;
        public uint ExtraInformation;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WNDCLASS
    {
        public uint style;
        public WndProcDelegate lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public IntPtr hInstance;
        public IntPtr hIcon;
        public IntPtr hCursor;
        public IntPtr hbrBackground;
        public string? lpszMenuName;
        public string lpszClassName;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int pt_x;
        public int pt_y;
    }

    private delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "RegisterClassW")]
    private static extern ushort RegisterClass(ref WNDCLASS lpWndClass);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "CreateWindowExW")]
    private static extern IntPtr CreateWindowEx(
        int dwExStyle,
        string lpClassName,
        string lpWindowName,
        int dwStyle,
        int x, int y, int nWidth, int nHeight,
        IntPtr hWndParent,
        IntPtr hMenu,
        IntPtr hInstance,
        IntPtr lpParam);

    [DllImport("user32.dll")]
    private static extern IntPtr DefWindowProc(IntPtr hWnd, uint uMsg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] pRawInputDevices, uint uiNumDevices, uint cbSize);

    [DllImport("user32.dll")]
    private static extern uint GetRawInputData(IntPtr hRawInput, uint uiCommand, IntPtr pData, ref uint pcbSize, uint cbSizeHeader);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern uint GetRawInputDeviceInfo(IntPtr hDevice, uint uiCommand, IntPtr pData, ref uint pcbSize);

    [DllImport("user32.dll")]
    private static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref MSG lpMsg);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);
}
