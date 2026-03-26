export default function AppLogo() {
    return (
        <>
            <div className="flex aspect-square size-20 shrink-0 items-center justify-center overflow-hidden rounded-md">
                <img
                    src="/logo.png"
                    alt="Lox Billiard"
                    className="h-full w-full object-contain"
                />
            </div>
            <div className="ml-1 grid flex-1 text-left text-sm">
                <span className="mb-0.5 truncate leading-tight font-semibold">
                    Lox Billiard
                </span>
            </div>
        </>
    );
}
