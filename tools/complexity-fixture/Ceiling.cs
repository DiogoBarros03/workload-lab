namespace WorkloadLab.ComplexityFixture;

// Guards the C# complexity ceiling: cyclomatic complexity 10 must build, 11 must not.
public static class Ceiling
{
    public static int AtTheCeiling(int n)
    {
        var score = 0;
        if (n > 1) score++;
        if (n > 2) score++;
        if (n > 3) score++;
        if (n > 4) score++;
        if (n > 5) score++;
        if (n > 6) score++;
        if (n > 7) score++;
        if (n > 8) score++;
        if (n > 9) score++;
        return score;
    }
}
